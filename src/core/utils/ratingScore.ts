/**
 * 95% Wilson lower bound for binary approval (up/down votes).
 *
 * This is a standard confidence-adjusted score: a 100/0 vote count ranks
 * sensibly above a 1/0 count, and a 20/0 count ranks above 100/100, matching
 * what cards show as approval. Returns 0 when there are no votes so unrated
 * assets never float above genuinely popular ones.
 */
export function wilsonScore (upvotes: number, downvotes: number): number {
  const n = upvotes + downvotes
  if (!Number.isFinite(n) || n <= 0) return 0

  const z = 1.96
  const zSquared = z * z
  const p = upvotes / n
  const center = p + (zSquared / (2 * n))
  const margin = z * Math.sqrt((p * (1 - p) + (zSquared / (4 * n))) / n)
  const denominator = 1 + (zSquared / n)

  return Math.max(0, (center - margin) / denominator)
}
