import tseslint from 'typescript-eslint';

// @vercel/node compiles every .ts file individually with Node ESM resolution,
// which requires explicit .js extensions on relative imports at runtime.
// This rule catches missing extensions before they reach Vercel.
const requireRelativeJsExtension = {
  meta: { type: 'problem', fixable: 'code', schema: [] },
  create(context) {
    function check(node, source) {
      if (!source) return;
      if (!source.startsWith('.')) return;
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
