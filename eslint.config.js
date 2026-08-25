import js from '@eslint/js'
import ts from 'typescript-eslint'

// Deliberately small. The compiler already enforces types (strict: true) and prettier owns
// formatting, so this only covers what neither of those catches.
export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // used deliberately at the PostgREST boundary
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off', // this is a CLI
    },
  },
  {
    // stdout belongs to the MCP protocol — a stray console.log there corrupts the stream.
    files: ['src/mcp/**/*.ts'],
    rules: { 'no-console': ['error', { allow: ['error'] }] },
  },
]
