import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**', 'node_modules/**', '.tmp/**', '.github/**', 'tests/.tmp/**'],
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // Nodulus currently uses any for generic typing signatures in certain internal modules
      '@typescript-eslint/no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_', 
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_' 
      }]
    }
  }
);
