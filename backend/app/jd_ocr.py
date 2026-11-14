"""Read text from images, flyers and scanned PDFs (OCR), using Tesseract when it is installed.

Tesseract is a free program installed separately (Windows: the "Tesseract-OCR" installer).
It is found automatically on the PATH or in its usual Windows folder, or set TESSERACT_CMD
to the full path of tesseract.exe. Without it, images are still saved, just not read.

Designed flyers need more than plain OCR, so images go through a layout-aware reader:
crop away phone-screenshot borders, enlarge small text, read in two passes (body text and
big headline text), keep columns apart, read "label above value" cells (Experience,
Location, CTC…), drop bullet icons and low-confidence junk, and pick the job title from
the largest headline. The result is plain "Label: value" lines plus the body text, which
the normal JD field rules then read.
"""
import os
import re
import shutil
from dataclasses import dataclass
from io import BytesIO
from statistics import median

MAX_PIXELS = 40_000_000          # refuse "decompression bomb" images
MAX_PDF_PAGES = 5                # a JD rarely needs more; keeps OCR fast
TARGET_WIDTH = 2400              # small flyers are enlarged to about this width
_WINDOWS_PATHS = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe"),
)
# headline text on flyers that is not the job title
_NOT_TITLE = re.compile(
    r"hiring|we'?re|we are|join|apply|built\s*with|heart|delivered|integrity|technolog|dm\s*&|www\.|@|\.com|"
    r"send\s*your|urgent|opening|vacanc|careers?|follow",
    re.I,
)
# labels that flyers place above their value, in a cell
_CELL_LABELS = {
    "experience": "Experience", "exp": "Experience", "location": "Location", "locations": "Location",
    "ctc": "CTC", "salary": "CTC", "package": "CTC", "budget": "CTC", "mode": "Work Mode",
    "qualification": "Qualification", "education": "Qualification", "openings": "Openings", "positions": "Openings",
}


_COMMON_WORDS = set("""
degree field aerospace defense electronics engineering experience management responsibilities implementation
implementations configuration configure support reports changes product products governance integration integrations
certification preferred qualification qualifications bachelor master masters manufacturing procurement financials platforms
global programs consultants practices deployment strategies systems information related delivering lifecycle cloud analysis
workshops requirements solutions enterprise transformation rollouts country medical devices consumer goods industrial
automotive publisher spreadsheet uploads agile quality innovation development supplier orders design prepare define
manage collaborate develop provide mentor junior adoption status updates mitigation launch readiness hypercare production
cutover scenarios defect triage compliance collaboration introduction conversions extensions business process flows
workbooks touchpoints modules summary skills location hybrid remote onsite salary package openings positions knowledge
strong excellent communication stakeholders analytical technical functional consultant developer engineer analyst
architect manager specialist senior junior associate lead principal
""".split())


def tesseract_command() -> str | None:
    candidates = [os.getenv("TESSERACT_CMD", "").strip(), shutil.which("tesseract") or "", *_WINDOWS_PATHS]
    return next((path for path in candidates if path and os.path.isfile(path)), None)


def ocr_available() -> bool:
    try:
        import pytesseract  # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError:
        return False
    return tesseract_command() is not None


# ---------------------------------------------------------------------------
# Preparing the picture
# ---------------------------------------------------------------------------

def _crop_screen_borders(image):
    """Phone screenshots: keep the largest bright band (the flyer), drop the status bar and black bars."""
    small = image.convert("L").resize((min(120, image.width), image.height))
    data = list(small.getdata())
    width = small.width
    bright_rows = [sum(1 for x in data[y * width:(y + 1) * width] if x > 60) / width > 0.5 for y in range(small.height)]
    best, start = (0, 0), None
    for y, bright in enumerate(bright_rows + [False]):
        if bright and start is None:
            start = y
        elif not bright and start is not None:
            if y - start > best[1] - best[0]:
                best = (start, y)
            start = None
    top, bottom = best
    height = bottom - top
    if image.height * 0.3 < height < image.height * 0.92:
        return image.crop((0, top, image.width, bottom))
    return image


def _prepare(image):
    from PIL import Image, ImageFilter, ImageOps

    image = ImageOps.exif_transpose(image).convert("RGB")          # phone photos taken sideways
    image = _crop_screen_borders(image)
    factor = 1
    if image.width < TARGET_WIDTH:
        factor = max(1, min(4, round(TARGET_WIDTH / image.width)))
        while factor > 1 and image.width * image.height * factor * factor > MAX_PIXELS:
            factor -= 1
    if factor > 1:
        image = image.resize((image.width * factor, image.height * factor), Image.LANCZOS)
    gray = ImageOps.autocontrast(ImageOps.grayscale(image))
    return gray.filter(ImageFilter.UnsharpMask(radius=2, percent=150, threshold=3))


# ---------------------------------------------------------------------------
# Words and lines from Tesseract
# ---------------------------------------------------------------------------

@dataclass
class Word:
    text: str
    conf: float
    left: int
    top: int
    width: int
    height: int
    key: tuple

    @property
    def right(self) -> int:
        return self.left + self.width

    @property
    def bottom(self) -> int:
        return self.top + self.height

    @property
    def mid_x(self) -> float:
        return self.left + self.width / 2


def _words(image, psm: int) -> list[Word]:
    import pytesseract

    pytesseract.pytesseract.tesseract_cmd = tesseract_command()
    try:
        data = pytesseract.image_to_data(image, config=f"--psm {psm}", output_type=pytesseract.Output.DICT, timeout=90)
    except RuntimeError:                                            # Tesseract took too long
        return []
    words = []
    for i, text in enumerate(data["text"]):
        text = (text or "").strip()
        conf = float(data["conf"][i])
        if text and conf >= 0:
            words.append(Word(text, conf, data["left"][i], data["top"][i], data["width"][i], data["height"][i],
                              (data["block_num"][i], data["par_num"][i], data["line_num"][i])))
    return words


def _lines(words: list[Word]) -> list[list[Word]]:
    groups: dict[tuple, list[Word]] = {}
    for word in words:
        groups.setdefault(word.key, []).append(word)
    return [sorted(group, key=lambda w: w.left) for group in groups.values()]


_JUNK_TOKENS = {"e", "o", "©", "®", "@", "*", "•", "-", "—", "»", "«", "|", "al", "xs", "a)", "v)", "'v)", "€)", ".", ":", ";"}


def _is_bullet(word: Word) -> bool:
    text = word.text.strip()
    if text.lower() in _JUNK_TOKENS:
        return True
    if any(ch.isdigit() for ch in text):
        return False                                                # numbers are values, never bullets
    letters = sum(ch.isalnum() for ch in text)
    return len(text) <= 3 and (letters == 0 or word.conf < 80)


def _clean_segment(words: list[Word]) -> list[Word]:
    words = [w for w in words if (w.conf >= 35 and any(ch.isalnum() or ch in "&/₹" for ch in w.text)) or w.text in ("-", "–", "—", "/", "&")]
    while words and _is_bullet(words[0]):
        words = words[1:]
    return words


def _segments(lines: list[list[Word]], page_width: int) -> list[list[Word]]:
    """Split OCR lines where there is a wide gap, so side-by-side columns don't merge."""
    gap = page_width * 0.03
    segments = []
    for line in lines:
        current = [line[0]]
        for word in line[1:]:
            if word.left - current[-1].right > gap:
                segments.append(current)
                current = [word]
            else:
                current.append(word)
        segments.append(current)
    return [cleaned for cleaned in (_clean_segment(s) for s in segments) if cleaned]


def _text(words: list[Word]) -> str:
    return re.sub(r"\s+", " ", " ".join(w.text for w in words)).strip(" |")


# ---------------------------------------------------------------------------
# Flyer parts: title, label cells, columns
# ---------------------------------------------------------------------------

def _fix_with_vocabulary(text: str, vocabulary: set[str]) -> str:
    """'Oracie' -> 'Oracle' when the flyer clearly says 'Oracle' elsewhere."""
    def fix(word: str) -> str:
        bare = word.strip(".,:;!")
        if len(bare) < 4 or bare.lower() in vocabulary:
            return word
        for known in sorted(vocabulary):
            if len(known) == len(bare) and sum(a != b for a, b in zip(known, bare.lower())) == 1:
                fixed = known.upper() if bare.isupper() else known.capitalize() if bare[0].isupper() else known
                return word.replace(bare, fixed)
        return word
    return " ".join(fix(word) for word in text.split())


def _title(image, body_words: list[Word], vocabulary: set[str]) -> str | None:
    """The tallest headline that isn't 'We're hiring', the logo or the tagline."""
    from PIL import Image

    half = image.resize((max(1, image.width // 2), max(1, image.height // 2)), Image.LANCZOS) if image.width > 1600 else image
    scale = image.width / half.width
    headline_words = [w for w in _words(half, 11) if w.conf >= 50]
    body_height = median([w.height for w in body_words]) if body_words else 0
    candidates = []
    for line in _lines(headline_words):
        line = [w for w in line if any(ch.isalpha() for ch in w.text)]
        text = _text(line)
        if len(re.sub(r"[^A-Za-z]", "", text)) < 3 or _NOT_TITLE.search(text):
            continue
        candidates.append((median([w.height for w in line]) * scale, line[0].top * scale, text))
    if not candidates:
        return None
    height, top, text = max(candidates)
    if body_height and height < body_height * 1.6:                 # no real headline: a plain document
        return None
    # a title may run over two lines of the same size ("Senior Oracle" / "PLM Consultant")
    partner = [c for c in candidates if c is not None and c[2] != text and c[0] >= height * 0.8 and 0 < abs(c[1] - top) < height * 2.5]
    if partner:
        first, second = sorted([(top, text), (partner[0][1], partner[0][2])])
        text = f"{first[1]} {second[1]}"
    text = re.sub(r"[^A-Za-z0-9&/+.,()# -]", "", _fix_with_vocabulary(text, vocabulary)).strip(" .,-")
    return text or None


def _label_key(text: str) -> str | None:
    key = re.sub(r"[^a-z]", "", text.lower())
    if key in _CELL_LABELS:
        return key
    for known in _CELL_LABELS:               # OCR slips like "Exnerience"
        if len(known) >= 6 and len(known) == len(key) and sum(a != b for a, b in zip(known, key)) == 1:
            return known
    return None


def _label_cells(words: list[Word]) -> tuple[list[str], set[int], int | None]:
    """Flyer info cells with the label above the value, e.g. 'Experience:' over '10 - 12 Years'.

    Returns the "Label: value" lines, the ids of the words used, and the top of the strip.
    """
    labels = []
    for index, word in enumerate(words):
        key = _label_key(word.text)
        if key is None or not word.text.rstrip().endswith(":"):
            continue                                                # a label cell ends with a colon
        if key == "mode":
            partner = [w for w in words if w.key == word.key and w.right <= word.left + 5 and w.text.lower().startswith("work")
                       and word.left - w.right < word.height * 2]
            if not partner:
                continue
            start = max(partner, key=lambda w: w.right)
        else:
            start = word
        # "Location: Hyderabad" on one line is an inline label (the normal rules read it), not a cell
        gap = word.height * 3
        if any(w.key == word.key and 0 <= w.left - word.right < gap and _label_key(w.text) is None for w in words):
            continue
        labels.append((start, word, _CELL_LABELS[key]))
    used: set[int] = set()
    lines = []
    label_ids = {id(w) for l in labels for w in (l[0], l[1])}
    for start, label, name in labels:
        # labels in one strip can sit at slightly different heights (a long value is centred)
        row = sorted((l for l in labels if abs(l[1].top - label.top) < label.height * 2.5), key=lambda l: l[0].left)
        position = next(i for i, l in enumerate(row) if l[1] is label)
        left = (row[position - 1][1].right + start.left) / 2 if position > 0 else start.left - label.width
        right = (label.right + row[position + 1][0].left) / 2 if position + 1 < len(row) else label.right + label.width * 2
        below = [
            w for w in words
            if id(w) not in label_ids and w.top > label.top + label.height * 0.6 and left <= w.mid_x <= right
            and (w.conf >= 40 or re.match(r"^[₹$]?\d", w.text) or w.text in ("-", "–"))
        ]
        rows: dict[tuple, list[Word]] = {}
        for word in below:
            rows.setdefault(word.key, []).append(word)
        value, last_bottom = [], label.bottom
        for row_words in sorted(rows.values(), key=lambda ws: min(w.top for w in ws)):
            if min(w.top for w in row_words) - last_bottom > label.height * 1.8:
                break
            value.extend(sorted(row_words, key=lambda w: w.left))
            last_bottom = max(last_bottom, max(w.bottom for w in row_words))
        while value and _is_bullet(value[0]):
            value = value[1:]
        text = _text(value)
        if text:
            lines.append(f"{name}: {text}")
            used.update(id(w) for w in value)
            used.update({id(start), id(label)})
    strip_top = min((l[1].top for l in labels), default=None) if lines else None
    return lines, used, strip_top


_BRANDING = re.compile(r"built\s*with|heart\.?$|delivered\s*with|integrity|^technolog|dm\s*&|www\.|\.com\b|follow|visit\s*our|send\s*your\s*cv|linkedin|instagram", re.I)


_LOOKALIKE = str.maketrans({"0": "O", "8": "B", "1": "I", "5": "S"})


def _fix_typos(words: list[Word], vocabulary: set[str], codes: dict[str, int]) -> list[Word]:
    """Correct OCR slips: common JD words first, then words and codes read clearly elsewhere in the flyer."""
    fixed = []
    for word in words:
        text = word.text
        bare = text.strip(".,:;()")
        is_code = 2 <= len(bare) <= 5 and bare.upper() == bare and any(ch.isalpha() for ch in bare)
        if is_code:
            lookalike = bare.translate(_LOOKALIKE)                 # "80M" -> "BOM"
            seen = codes.get(bare, 0)
            better = [c for c, n in codes.items() if (n > seen or (n == seen and word.conf < 85)) and len(c) == len(bare) and c != bare
                      and sum(a != b for a, b in zip(c, lookalike)) <= (0 if lookalike != bare else 1)]
            if lookalike != bare and lookalike in codes:
                text = text.replace(bare, lookalike)
            elif len(better) == 1:                                  # "POH" (once) -> "PDH" (several times)
                text = text.replace(bare, better[0])
        elif bare.lower() not in _COMMON_WORDS:
            common = _fix_with_vocabulary(text, _COMMON_WORDS)
            text = common if common != text else _fix_with_vocabulary(text, vocabulary)
        fixed.append(Word(text, word.conf, word.left, word.top, word.width, word.height, word.key))
    return fixed


def _read_layout(image) -> str:
    prepared = _prepare(image)
    words = _words(prepared, 3)
    if not words:
        return ""
    vocabulary = {re.sub(r"[^a-z]", "", w.text.lower()) for w in words if w.conf >= 85 and len(w.text) >= 4}
    vocabulary.discard("")
    codes: dict[str, int] = {}
    for w in words:                                                 # all-caps codes (BOM, PDH…) and how often they appear
        code = re.sub(r"[^A-Z0-9]", "", w.text)
        if w.conf >= 70 and 2 <= len(code) <= 5 and code.isalpha() and code == w.text.strip(".,:;()"):
            codes[code] = codes.get(code, 0) + 1
    segments = _segments(_lines(words), prepared.width)

    # two columns? (many lines start near the left edge AND many start around the middle)
    width = prepared.width
    starts = [s[0].left for s in segments]
    left_starts = [x for x in starts if x < width * 0.15]
    middle_starts = [x for x in starts if width * 0.4 < x < width * 0.8]
    if len(left_starts) >= 6 and len(middle_starts) >= 6:
        centre = median(middle_starts)                             # headings sit a little left of their indented items
        split = min(x for x in middle_starts if x > centre - width * 0.06) - width * 0.01
        left_column = [s for s in segments if s[0].left < split]
        right_column = [s for s in segments if s[0].left >= split]
        ordered = sorted(left_column, key=lambda s: s[0].top) + sorted(right_column, key=lambda s: s[0].top)
    else:
        ordered = sorted(segments, key=lambda s: (s[0].top, s[0].left))

    header = []
    title = _title(prepared, words, vocabulary)
    if title:
        header.append(f"Job Title: {title}")
    cell_lines, used, strip_top = _label_cells(sorted(words, key=lambda w: (w.top, w.left)))
    header += cell_lines
    # the contact footer (email, website, social links) sits at the bottom: drop it and anything below
    footer_words = [w for w in words if w.top > prepared.height * 0.75 and re.search(r"\w@\w|www|\.com|follow|linkedin|instagram|website|whatsapp", w.text, re.I)]
    footer_top = min((w.top for w in footer_words), default=None)
    body = []
    for segment in ordered:
        if footer_top is not None and segment[0].bottom > footer_top - 4:
            continue
        if all(id(w) in used for w in segment):
            continue                                                # already read as a label cell
        if strip_top is not None and segment[0].bottom < strip_top:
            continue                                                # logo, tagline and graphics above the info strip
        if len(segment) <= 4 and sum(w.conf for w in segment) / len(segment) < 75:
            continue                                                # short, unsure fragments (icons, footer)
        text = _text(_fix_typos(segment, vocabulary, codes))
        letters = sum(ch.isalpha() for ch in text)
        if letters < 3 or letters < len(text) * 0.5 or "\\" in text:
            continue                                                # icon labels and graphic fragments
        if _BRANDING.search(text) and len(text.split()) <= 6:
            continue                                                # logo, tagline, website, contact footer
        body.append(text)
    return "\n".join(header + body)


def image_to_text(content: bytes) -> str:
    from PIL import Image

    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    with Image.open(BytesIO(content)) as image:
        image.load()
        return _read_layout(image)


def pdf_to_text(content: bytes) -> str:
    """OCR the first pages of a scanned (image-only) PDF."""
    import pypdfium2 as pdfium

    document = pdfium.PdfDocument(content)
    try:
        texts = []
        for index in range(min(len(document), MAX_PDF_PAGES)):
            bitmap = document[index].render(scale=3)                # ~216 dpi
            texts.append(_read_layout(bitmap.to_pil()))
        return "\n".join(texts)
    finally:
        document.close()
