import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { configs as tseslintConfigs } from 'typescript-eslint'

const reactHooksRecommended = reactHooks.configs?.recommended ?? { rules: {} }
const reactRefreshVite = reactRefresh.configs?.vite ?? { rules: {} }

const appImportPatterns = [
  '@app',
  '@app/*',
  'src/app',
  'src/app/*',
  '../app',
  '../app/*',
  '../../app',
  '../../app/*',
  '../../../app',
  '../../../app/*',
  '../../../../app',
  '../../../../app/*',
  '../../../../../app',
  '../../../../../app/*',
]

const featuresImportPatterns = [
  '@features',
  '@features/*',
  'src/features',
  'src/features/*',
  '../features',
  '../features/*',
  '../../features',
  '../../features/*',
  '../../../features',
  '../../../features/*',
  '../../../../features',
  '../../../../features/*',
  '../../../../../features',
  '../../../../../features/*',
]

export default [
  {
    ignores: [
      'dist',
      'node_modules',
      '.tmp/**',
      'outputs/**',
      'functions/venv/**',
      'flutter_app/**',
      'scripts/**',
      'tailwind.config.js',
    ],
  },
  js.configs.recommended,
  ...(tseslintConfigs?.recommended ?? tseslint.configs?.recommended ?? []),
  {
    files: ['services/uniqueplay-sync-worker/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    files: ['services/uniqueplay-sync-worker/src/adapter.mjs'],
    languageOptions: {
      globals: globals.browser,
    },
  },
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
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: appImportPatterns,
              message: 'shared 레이어는 app 레이어를 참조할 수 없습니다.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: featuresImportPatterns,
              message: 'core 레이어는 features 레이어를 참조할 수 없습니다.',
            },
          ],
        },
      ],
    },
  },
]
