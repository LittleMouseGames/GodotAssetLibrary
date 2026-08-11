/**
 * Client-facing error with an explicit HTTP status. The global error handler
 * in RouterServer honors `statusCode`; unmarked errors become 500.
 */
export class BadRequestError extends Error {
  public readonly statusCode = 400

  constructor (message: string) {
    super(message)
    this.name = 'BadRequestError'
  }
}
