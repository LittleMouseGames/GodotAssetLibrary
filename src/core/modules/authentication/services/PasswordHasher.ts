import * as argon2 from 'argon2'

const parsedLimit = Number.parseInt(process.env.ARGON2_MAX_CONCURRENCY ?? '', 10)
const MAX_CONCURRENCY = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 2
let activeOperations = 0

export class PasswordHasherBusyError extends Error {
  constructor () {
    super('Password service is busy, please try again shortly')
    this.name = 'PasswordHasherBusyError'
  }
}

async function withCapacity<T> (operation: () => Promise<T>): Promise<T> {
  if (activeOperations >= MAX_CONCURRENCY) {
    throw new PasswordHasherBusyError()
  }

  activeOperations++
  try {
    return await operation()
  } finally {
    activeOperations--
  }
}

/** Bound memory-hard password operations across all requests in this process. */
export async function hashPassword (password: string): Promise<string> {
  return await withCapacity(async () => await argon2.hash(password))
}

/** Bound memory-hard password operations across all requests in this process. */
export async function verifyPassword (hash: string, password: string): Promise<boolean> {
  return await withCapacity(async () => await argon2.verify(hash, password))
}
