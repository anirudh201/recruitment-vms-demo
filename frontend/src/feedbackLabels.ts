import type { FeedbackKind } from './api/client'

export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = { bug: 'Bug', feature: 'Feature idea', other: 'Other' }
export const FEEDBACK_STATUS_LABEL: Record<string, string> = { new: 'New', in_progress: 'In progress', done: 'Done', wont_fix: "Won't fix" }
