import wallpaper from '../assets/login-wallpaper.webp'

// Left side of the sign-in page: the DM&I wallpaper (logo, ribbons and the "Built with heart" badge
// are part of the picture). The two lines of text are real text placed over the picture.
export default function LoginBrand() {
  return (
    <aside className="lb-panel" aria-label="DM&I Technologies" style={{ '--lb-wall': `url(${wallpaper})` } as React.CSSProperties}>
      <div className="lb-wall">
        <p className="sr-only">DM&I Technologies. Built with heart. Delivered with integrity.</p>
        <div className="lb-text">
          <p className="lb-headline">Empowering connection, driving innovation.</p>
          <p className="lb-sub">Welcome back. Log in to access your dashboard and manage your technology solutions.</p>
        </div>
      </div>
    </aside>
  )
}
