import nextTypescript from 'eslint-config-next/typescript'
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

// eslint-config-next exports flat config arrays, so no compatibility layer (@eslint/eslintrc) is needed.

const sharedRules = {
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
}

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: sharedRules,
  },
  {
    ignores: ['.next/', 'vTarikhi/', 'src/payload-types.ts', 'src/payload-generated-schema.ts'],
  },
]

export default eslintConfig
