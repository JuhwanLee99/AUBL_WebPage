import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { configs as tseslintConfigs } from 'typescript-eslint'

const reactHooksRecommended = reactHooks.configs?.recommended ?? { rules: {} }
const reactRefreshVite = reactRefresh.configs?.vite ?? { rules: {} }

export default [
  {
    ignores: [
      'dist',
      'node_modules',
      'functions/venv/**',
      'scripts/**',
      'tailwind.config.js',
    ],
  },
  js.configs.recommended,
  ...(tseslintConfigs?.recommended ?? tseslint.configs?.recommended ?? []),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...(reactHooksRecommended.rules ?? {}),
      ...(reactRefreshVite.rules ?? {}),
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
]
