import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      // Relative imports must not carry .js extensions — this package is consumed
      // at source level by Turbopack (transpilePackages), which cannot resolve
      // TypeScript source files by their compiled .js extension.
      'no-restricted-syntax': [
        'error',
        {
          selector: "ImportDeclaration[source.value=/^\\.{1,2}\\/.+\\.js$/]",
          message: "Do not use .js extensions in relative imports inside packages/shared/src — Turbopack resolves source, not dist.",
        },
      ],
    },
  },
];
