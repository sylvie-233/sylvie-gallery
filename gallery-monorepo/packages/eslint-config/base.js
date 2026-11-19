/**
 * Node / 库共享的 ESLint 基线配置（flat config）。
 * 供 API、各 packages 通过 `import base from '@sylvie/eslint-config/base'` 引入；
 * React 项目应改用 `@sylvie/eslint-config/react`（在基线上追加浏览器环境）。
 */
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Node / 库共享的 ESLint 基线配置。 */
export default tseslint.config(
  // 构建产物、依赖与声明文件不参与检查
  {
    ignores: ['dist/**', 'node_modules/**', '**/*.d.ts'],
  },
  // ESLint 官方推荐规则
  js.configs.recommended,
  // typescript-eslint 推荐规则（不做类型感知检查，速度快）
  ...tseslint.configs.recommended,
  // 运行时环境与项目自定义规则
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // 未使用变量报错，但允许用下划线前缀显式忽略（如 _req）
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // 仅用于类型的导入必须写成 `import type`，配合 verbatimModuleSyntax 保持运行时无多余导入
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  // 关闭与 Prettier 冲突的格式类规则；必须放在最后覆盖前面的配置
  prettier,
);
