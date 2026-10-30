import type { Job } from './api/client'

// Budgets are stored in rupees per year: show them the way Indian CTCs are discussed (lakhs per annum).
export function formatCtc(amount: number): string {
  if (amount >= 100000) {
    const lakhs = Math.round((amount / 100000) * 100) / 100
    return `${lakhs} LPA`
  }
  return `₹${amount.toLocaleString('en-IN')}`
}

export function offeredCtc(job: Job): string {
  const min = job.budget_min ?? null
  const max = job.budget_max ?? null
  if (min == null && max == null) return 'Not specified'
  if (min != null && max != null) {
    if (min === max) return formatCtc(max)
    // "10 – 13 LPA" reads better than "10 LPA – 13 LPA" when both are in lakhs.
    return min >= 100000 && max >= 100000 ? `${formatCtc(min).replace(' LPA', '')} – ${formatCtc(max)}` : `${formatCtc(min)} – ${formatCtc(max)}`
  }
  return min != null ? `From ${formatCtc(min)}` : `Up to ${formatCtc(max as number)}`
}

export function experienceRange(job: Job): string {
  if (job.min_experience == null) return 'Not specified'
  return job.max_experience != null ? `${job.min_experience}–${job.max_experience} yrs` : `${job.min_experience}+ yrs`
}
