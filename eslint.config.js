import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  /* Build output and native shells: `out` is the static export (bundled JS, not source),
     and `android`/`ios` are Capacitor-generated Xcode/Gradle projects that carry their own
     JS copy of that same export. Linting any of them reports thousands of errors about
     minified code nobody wrote. */
  globalIgnores(['dist', '.next', 'out', 'android', 'ios', 'node_modules']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      /* Next.js code runs in both the browser and Node (server components, config),
         so expose both sets of globals. */
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      /* Underscore-prefixed args/vars are intentionally unused (e.g. the mock
         login's `_email`/`_password` placeholders). */
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      /* The App Router page-transition FrozenRouter intentionally reads a ref
         during render to freeze the exiting route — a legitimate use the new
         compiler-oriented rule rejects. */
      'react-hooks/refs': 'off',
    },
  },
])
