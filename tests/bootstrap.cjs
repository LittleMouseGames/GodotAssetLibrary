/**
 * Runtime bootstrap for the compiled test suite.
 *
 * Tests are compiled by `tsc -p tsconfig.test.json` into `dist-test/` with the
 * source tree under `dist-test/src`. TypeScript path aliases (`core/*`,
 * `app/*`) are not rewritten by the compiler, so this registers them against
 * the compiled output before the test files load.
 */
const path = require('path')
const tsConfigPaths = require('tsconfig-paths')

const baseUrl = path.resolve(__dirname, '..', 'dist-test', 'src')

tsConfigPaths.register({
  baseUrl,
  paths: {
    'core/*': ['core/*'],
    'app/*': ['app/*']
  }
})
