/**
 * Minimal type declarations for Node's built-in test runner.
 *
 * The project pins @types/node@17, which predates the `node:test` module
 * types. This shim is included only by tsconfig.test.json so the compiled
 * tests typecheck without upgrading the shared types dependency. The real
 * `node:test` module is available at runtime on Node 18+.
 */
declare module 'node:test' {
  export type TestFn = () => void | Promise<void>
  export function describe (name: string, fn: () => void): void
  export function it (name: string, fn: TestFn): void
  export const test: typeof it
}
