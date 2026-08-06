export interface Pagination {
  limit: number
  page: number
  skip: number
}

const DEFAULT_LIMIT = 12
const MAX_LIMIT = 36
const MAX_PAGE = 1000

/** Parse pagination without allowing MongoDB's limit=0 or unbounded deep skips. */
export function parsePagination (limitValue: unknown, pageValue: unknown): Pagination {
  const requestedLimit = Number(limitValue ?? DEFAULT_LIMIT)
  const requestedPage = Number(pageValue ?? 0)

  const limit = Number.isInteger(requestedLimit) && requestedLimit >= 1
    ? Math.min(requestedLimit, MAX_LIMIT)
    : DEFAULT_LIMIT
  const page = Number.isInteger(requestedPage) && requestedPage >= 0
    ? Math.min(requestedPage, MAX_PAGE)
    : 0

  return { limit, page, skip: limit * page }
}
