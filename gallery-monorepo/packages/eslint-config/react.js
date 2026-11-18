import globals from 'globals';

import base from './base.js';

/** Web（Next.js / React）配置：在基线上补充浏览器全局变量。 */
export default [
  ...base,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-undef': 'off',
    },
  },
  {
    ignores: ['.next/**', 'out/**', 'next-env.d.ts'],
  },
];
