import tseslint from 'typescript-eslint';

// Two ESM rules required by @vercel/node's compilation model:
//
// 1. Relative imports must end in .js — @vercel/node compiles each .ts file
//    individually with Node ESM resolution, which requires explicit extensions.
//
// 2. @brighttale/shared sub-path imports must NOT end in .js — the package's
//    exports map is "./*" → "./dist/*.js", so adding .js causes double extension
//    (autopilotTemplates.js.js). Only relative imports need explicit extensions.
const requireRelativeJsExtension = {
  meta: { type: 'problem', fixable: 'code', schema: [] },
  create(context) {
    function check(node, source) {
      if (!source) return;
      // Rule 1: relative imports must have .js
      if (source.startsWith('.')) {
        if (/\.[cm]?js$/.test(source) || source.endsWith('.json')) return;
        context.report({
          node,
          message: `Relative import '${source}' must end in .js (Node ESM requires explicit extensions).`,
          fix(fixer) {
            const raw = node.type === 'Literal' ? node.raw : null;
            if (!raw) return null;
            const quote = raw[0];
            return fixer.replaceText(node, `${quote}${source}.js${quote}`);
          },
        });
        return;
      }
      // Rule 2: @brighttale/shared sub-path imports must NOT have .js
      if (source.startsWith('@brighttale/shared/') && source.endsWith('.js')) {
        context.report({
          node,
          message: `@brighttale/shared sub-path import '${source}' must not end in .js (exports map adds it, causing double extension).`,
          fix(fixer) {
            const raw = node.type === 'Literal' ? node.raw : null;
            if (!raw) return null;
            const quote = raw[0];
            return fixer.replaceText(node, `${quote}${source.slice(0, -3)}${quote}`);
          },
        });
      }
    }
    return {
      ImportDeclaration(node) { check(node.source, node.source.value); },
      ExportNamedDeclaration(node) { if (node.source) check(node.source, node.source.value); },
      ExportAllDeclaration(node) { check(node.source, node.source.value); },
    };
  },
};

export default tseslint.config(
  tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    plugins: { local: { rules: { 'require-relative-js-extension': requireRelativeJsExtension } } },
    rules: {
      'local/require-relative-js-extension': 'error',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'api/**', 'src/bundle.js', 'src/**/__tests__/**'],
  },
);
