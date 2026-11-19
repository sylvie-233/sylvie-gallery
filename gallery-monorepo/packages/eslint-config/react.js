/**
 * Web（Next.js / React）ESLint 配置：在 `base` 基线上补充浏览器全局变量。
 * 供 apps/web、apps/admin 与 `@sylvie/ui` 通过
 * `import react from '@sylvie/eslint-config/react'` 引入。
 */
import globals from 'globals';

import base from './base.js';

/** Web（Next.js / React）配置：在基线上补充浏览器全局变量。 */
export default [
  // 继承 Node / 库基线（JS 推荐规则 + TS 推荐规则 + Prettier 兼容）
  ...base,
  // 浏览器与 Node 全局变量并存，TypeScript 已负责未定义检查
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // 类型由 TypeScript 校验，避免与 TS 全局声明重复报错
      'no-undef': 'off',
    },
  },
  // 构建产物与 Next.js 自动生成文件不参与检查
  {
    ignores: ['.next/**', 'out/**', 'next-env.d.ts'],
  },
];
