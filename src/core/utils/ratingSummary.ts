import { wilsonScore } from './ratingScore'

export interface RatingSummary {
  total: number
  upvotes: number
  downvotes: number
  /** Rounded percentage of positive votes (0-100). */
  approvalPercent: number
  /** Confidence-adjusted approval score (95% Wilson lower bound). */
  score: number
  hasRatings: boolean
  /** Human-readable summary used on cards, lists and detail pages. */
  label: string
}

/**
 * Build the honest binary-approval summary for an asset.
 *
 * The site collects up/down votes, not one-to-five star ratings. Presenting
 * that as "stars out of 5" is misleading, so every surface uses approval
 * percentage plus sample size instead.
 */
export function buildRatingSummary (upvotes: number, downvotes: number): RatingSummary {
  const up = Number.isFinite(Number(upvotes)) ? Number(upvotes) : 0
  const down = Number.isFinite(Number(downvotes)) ? Number(downvotes) : 0
  const total = up + down
  const approvalPercent = total > 0 ? Math.round((up / total) * 100) : 0
  const score = wilsonScore(up, down)
  const hasRatings = total > 0
  const label = hasRatings
    ? `${approvalPercent}% approval \u00b7 ${total} rating${total === 1 ? '' : 's'}`
    : 'No ratings yet'

  return { total, upvotes: up, downvotes: down, approvalPercent, score, hasRatings, label }
}
