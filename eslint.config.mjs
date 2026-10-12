import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

/**
 * Flat ESLint config.
 *
 * `eslint-config-next` v16 already ships flat config arrays, so the
 * `@eslint/eslintrc` `FlatCompat` layer that used to sit here is not needed —
 * and passing those arrays through `compat.extends()` makes ESLint throw
 * `TypeError: Converting circular structure to JSON` before linting a single
 * file (the `react` plugin references itself through `configs.flat`).
 *
 * The custom rule overrides below are unchanged from the previous config; they
 * are now declared once instead of twice.
 */
const projectRules = {
  rules: {
    '@typescript-eslint/ban-ts-comment': 'warn',
    '@typescript-eslint/no-empty-object-type': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        vars: 'all',
        args: 'after-used',
        ignoreRestSiblings: false,
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^(_|ignore)',
      },
    ],
  },
}

const eslintConfig = [
  {
    ignores: [
      '.next/',
      'vTarikhi/',
      'src/payload-types.ts',
      'src/payload-generated-schema.ts',
      'src/app/(payload)/admin/importMap.js',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  projectRules,
]

export default eslintConfig
