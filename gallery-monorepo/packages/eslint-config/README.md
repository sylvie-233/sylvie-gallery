# @sylvie/eslint-config

希尔薇图集共享的 ESLint 9 flat config：一套 Node / 库基线，以及在其上补充浏览器环境的 React 配置。

## 目录结构

```
packages/eslint-config/
├── base.js        # Node / 库基线：JS + TS 推荐规则、Node 全局、Prettier 兼容
├── react.js       # Web / React：base + 浏览器全局，关闭 no-undef
└── package.json   # 导出 ./base 与 ./react
```

## 在 workspace 中引入

在应用或包的 `package.json` 中添加（开发依赖）：

```json
{
  "devDependencies": {
    "@sylvie/eslint-config": "workspace:*",
    "eslint": "^9.18.0"
  }
}
```

`eslint` 是 peer dependency，需由使用方自行安装。包直接导出源码 `.js`，无需构建，修改后立即生效。

## 使用示例

Node / 库（API、`packages/*`）：

```js
// eslint.config.js
import base from '@sylvie/eslint-config/base';

export default base;
```

Web / React（`apps/web`、`apps/admin`、`packages/ui`）：

```js
// eslint.config.js
import react from '@sylvie/eslint-config/react';

export default react;
```

运行：在包内执行 `eslint . --max-warnings 0`（各包的 `lint` 脚本已配置），或仓库根目录 `pnpm lint`。

## 配置概览

| 导出 | 用途 | 关键内容 |
|---|---|---|
| `./base` | Node 服务与库 | `@eslint/js` 推荐规则、`typescript-eslint` 推荐规则、Node 全局变量；忽略 `dist/**`、`node_modules/**`、`**/*.d.ts` |
| `./react` | Next.js / React 应用 | 继承 `base`，补充 `globals.browser`，关闭 `no-undef`；忽略 `.next/**`、`out/**`、`next-env.d.ts` |

### base 自定义规则

| 规则 | 值 | 说明 |
|---|---|---|
| `@typescript-eslint/no-unused-vars` | `error`，`^_` 忽略 | 未使用变量报错，允许 `_req`、`_unused` 等显式忽略 |
| `@typescript-eslint/consistent-type-imports` | `error` | 纯类型导入必须使用 `import type` |
| `eslint-config-prettier` | 追加在最后 | 关闭与 Prettier 冲突的格式规则 |

## 设计约定

- **ESLint 9 flat config**：导出为数组/配置对象，不使用 `.eslintrc`。
- **不做类型感知检查**：仅启用 `typescript-eslint` 的 recommended（非 type-checked）规则，保证 lint 速度；类型正确性交给 `tsc --noEmit`。
- **Prettier 兜底**：`eslint-config-prettier` 必须位于配置末尾，新增规则时应加在它之前。
- **环境分离**：Node 包用 `base`，含 DOM/React 的应用用 `react`，避免在服务端代码中误用浏览器全局。
- **忽略构建产物**：`dist`、`.next`、声明文件等不参与检查。

## 验证

本包没有独立的 `build` / `typecheck` / `lint` 脚本，修改后通过使用方验证：

```bash
pnpm --filter @sylvie/types lint    # 任意使用 base 的包
pnpm --filter @sylvie/web lint      # 任意使用 react 的应用
# 或仓库根目录
pnpm lint
```

若新增配置项导致既有代码报错，请先确认规则是否为预期收紧，再调整代码，不要用全局 `eslint-disable` 掩盖。
