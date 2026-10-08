import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dist-perf', '.worktrees', '.claude', 'playwright-report', 'test-results', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  {
    // Test doubles and browser diagnostic probes intentionally use partial
    // shapes. Keep production code strict while allowing those fixtures.
    files: ['**/*.{test,spec}.{ts,tsx}', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // These components intentionally export shared non-component helpers.
    files: ['src/components/OnlineModal.tsx', 'src/components/LandscapePrompt.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // Forwarding a React.Ref as the JSX ref prop is the purpose of this mount.
    files: ['src/components/match/MatchCanvases.tsx'],
    rules: { 'react-hooks/refs': 'off' },
  },
  {
    files: ['scripts/**/*.mjs', '**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    // Playwright probes run callbacks inside the page's browser context.
    files: ['docs/mockups/{carrot-pickup,ceiling-bonk,player-bump,wall-bonk}/{capture-live,verify}.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
])
