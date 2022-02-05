module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    createDefaultProgram: true
  },
  plugins: [
    '@typescript-eslint'
  ],
  extends: [
    'standard-with-typescript'
  ],
  rules: {
    '@typescript-eslint/restrict-template-expressions': 0,
    '@typescript-eslint/indent': ['error', 2],
    indent: ['error', 2],
    semi: ['error', 'never'],
    quotes: [2, 'single'],
    '@typescript-eslint/no-this-alias': [
      'error',
      {
        allowDestructuring: true, // Allow `const { props, state } = this`; false by default
        allowedNames: ['self'] // Allow `const self = this`; `[]` by default
      }
    ]
  }
}
