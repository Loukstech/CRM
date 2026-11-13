import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '.data/**'] },
  js.configs.recommended,
  {
    files: ['**/*.mjs', '**/*.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        setInterval: 'readonly',
        module: 'writable',
        URL: 'readonly',
      },
    },
  },
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Une promesse oubliée = une écriture ou un contrôle d'accès non attendu.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Les classes NestJS (modules, DTO) sont légitimement « vides » ou sans await.
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/require-await': 'off',
      'no-console': 'error',
    },
  },
  {
    // Tests : les corps de réponse supertest sont typés `any`.
    files: ['**/test/**/*.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    // Scripts en ligne de commande : la console est leur interface.
    files: ['prisma/**/*.ts', 'apps/api/src/cli/**/*.ts', 'apps/api/src/main.ts'],
    rules: { 'no-console': 'off' },
  },
);
