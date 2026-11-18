import react from '@sylvie/eslint-config/react';

export default [
  ...react,
  {
    ignores: ['dist/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
];
