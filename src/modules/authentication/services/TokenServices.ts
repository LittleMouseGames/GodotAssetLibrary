import crypto from 'crypto'

export class TokenServices {
  private static instance: TokenServices

  /**
   * Return our class for singleton init
   */
  public static getInstance (): TokenServices {
    if (TokenServices.instance == null) {
      TokenServices.instance = new TokenServices()
    }

    return TokenServices.instance
  }

  /**
   * Generates a hashed token to be inserted into the database
   *
   * @param token the token to hash
   * @returns {string} hashed token
   */
  public hashToken (token: string): string {
    const hash = crypto.createHash('blake2b512')
    hash.update(token)
    return hash.digest('base64')
  }

  /**
   * Generate a resume token
   *
   * @returns {string} resume token
   */
  public generateToken (): string {
    const token = crypto.randomBytes(128).toString('base64')
    return token
  }

  /**
   * Generate a date for our token to expire
   *
   * @param {number} [date=5] optional param for when token should expires
   * @returns {Date} expiry date
   */
  public generateExpiry (date: number = 5): Date {
    const expires = new Date()
    expires.setDate(expires.getDate() + date) // get date X days from now

    return expires
  }
}
