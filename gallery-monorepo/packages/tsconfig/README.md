# @sylvie/tsconfig

希尔薇图集共享的 TypeScript 配置基线：按运行环境提供 base / library / node / next 四套 `tsconfig`，各应用与包通过 `extends` 复用。

> JSON 文件不支持注释，全部配置说明集中在本 README。

## 目录结构

```
packages/tsconfig/
├── base.json      # 公共严格基线
├── library.json   # 共享库（packages/*）
├── node.json      # Node 服务（API）
├── next.json      # Next.js（Web）
└── package.json   # files 暴露四个 JSON
```

## 在 workspace 中引入

在应用或包的 `package.json` 中添加（开发依赖）：

```json
{
  "devDependencies": {
    "@sylvie/tsconfig": "workspace:*"
  }
}
```

包通过 `files` 直接发布 JSON 文件（无构建步骤），使用方按路径 `extends`：

```json
// packages/types/tsconfig.json
{
  "extends": "@sylvie/tsconfig/library.json",
  "compilerOptions": { "outDir": "dist" },
  "include": ["src/**/*.ts"]
}
```

## 配置概览

| 配置 | 使用方 | 关键设置 |
|---|---|---|
| `base.json` | 其余三套的父配置 | `target: ES2022`、`module: ESNext`、`moduleResolution: Bundler`、`strict`、`noUncheckedIndexedAccess`、`noUnusedLocals/Parameters`、`verbatimModuleSyntax`、`isolatedModules`、`skipLibCheck`、`noEmit` |
| `library.json` | `packages/*`（types、utils、ui、db、cache 等） | 继承 base，开启 `declaration` / `declarationMap` / `sourceMap`，`composite: false` |
| `node.json` | `apps/api` | 继承 base，`lib: ES2023`、`types: ["node"]` |
| `next.json` | `apps/web` | 继承 base，追加 `DOM.Iterable`、`jsx: preserve`、`allowJs`、`incremental`、Next 插件，并放宽未使用变量检查（Next 生成代码需要） |

## 使用示例

```json
// apps/api/tsconfig.json
{
  "extends": "@sylvie/tsconfig/node.json"
}
```

```json
// apps/web/tsconfig.json
{
  "extends": "@sylvie/tsconfig/next.json"
}
```

```json
// apps/admin/tsconfig.json（Vite + React，使用通用 base）
{
  "extends": "@sylvie/tsconfig/base.json"
}
```

## 设计约定

- **严格优先**：`strict`、`noUncheckedIndexedAccess`、`noImplicitOverride`、`noFallthroughCasesInSwitch` 默认开启；确需放宽时在具体应用配置中覆盖并说明原因。
- **仅做类型检查**：base 设置 `noEmit: true`；实际构建由 tsup / Next / Vite 完成，库的声明文件由 tsup `--dts` 产出。
- **ESM 友好**：`module: ESNext` + `moduleResolution: Bundler`，源码相对导入保留 `.js` 后缀；`verbatimModuleSyntax` 要求类型导入写 `import type`。
- **按环境拆分**：Node 配置只带 Node 类型，Next 配置才引入 DOM 与 JSX 插件，避免服务端误用浏览器 API。
- **不做路径别名**：别名由各应用自行声明，基线不绑定具体目录结构。

## 验证

本包没有独立脚本（纯 JSON 配置），修改后通过使用方验证：

```bash
pnpm --filter @sylvie/types typecheck
pnpm --filter @sylvie/api typecheck
pnpm --filter @sylvie/web typecheck
# 或仓库根目录
pnpm typecheck
```

新增或收紧编译选项时，应同时跑一遍 `pnpm build`，确认各包的 tsup/Vite/Next 构建未受影响。
