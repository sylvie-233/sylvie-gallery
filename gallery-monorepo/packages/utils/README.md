# @sylvie/utils

希尔薇图集共享的纯函数工具集：日期、计数、价格、文件体积、时长与文字头像格式化，供 Web、Admin 与 API 复用。

## 目录结构

```
packages/utils/
├── src/
│   ├── format.ts   # 全部格式化纯函数
│   └── index.ts    # 汇总导出入口
├── package.json
└── tsconfig.json
```

## 在 workspace 中引入

```json
{
  "dependencies": {
    "@sylvie/utils": "workspace:*"
  }
}
```

构建产物位于 `dist/`，由 Turbo 的 `dependsOn: ["^build"]` 保证先构建再使用。

## 使用示例

```ts
import {
  formatDate,
  formatDateTime,
  formatCount,
  formatFileSize,
  formatPrice,
  avatarInitials,
  formatDuration,
  cn,
} from '@sylvie/utils';

formatDate('2026-11-07 12:00:00');      // '2026-11-07'
formatDateTime('2026-11-07 12:00:00');  // '2026-11-07 12:00'
formatDate(null);                       // '—'

formatCount(1260);      // '1.3k'
formatCount(12345);     // '1.2w'
formatCount(undefined); // '0'

formatFileSize(1536);        // '1.5 KB'
formatFileSize(2 * 1024 ** 2); // '2.0 MB'

formatPrice(1900); // '¥19'
formatPrice(1520); // '¥15.2'

avatarInitials('希尔薇'); // '希尔'
avatarInitials('  ');    // '希'

formatDuration(75);   // '01:15'
formatDuration(null); // '00:00'

cn('rounded', isActive && 'text-white', null); // 'rounded text-white'
```

## 导出概览

| 函数 | 参数 | 返回值 / 规则 |
|---|---|---|
| `formatDate(value)` | `string \| null \| undefined` | 取前 10 位日期；空值返回 `—` |
| `formatDateTime(value)` | `string \| null \| undefined` | 取前 16 位到分钟；空值返回 `—` |
| `formatCount(value)` | `number \| null \| undefined` | ≥1 万用 `w`、≥1 千用 `k`，保留一位小数；空值按 0 |
| `formatFileSize(bytes)` | `number` | 按 1024 换算为 `B` / `KB` / `MB`，保留一位小数 |
| `formatPrice(cents)` | `number` | 分 → `¥` 元；整数元不带小数，否则一位小数 |
| `avatarInitials(name)` | `string` | 取前 2 个 Unicode 字符并转大写；空白返回 `希` |
| `cn(...values)` | `Array<string \| false \| null \| undefined>` | 过滤假值后以空格拼接 |
| `formatDuration(seconds)` | `number \| null \| undefined` | 秒 → `mm:ss`，向下取整，负数按 0 |

## 设计约定

- **纯函数**：无副作用、无 I/O、不依赖 React / Node / 浏览器 API，任何运行环境可安全引入。
- **时区**：时间函数只对后端返回的北京时间字符串做切片，不做时区换算；需要本地化时由调用方先转换。
- **四舍五入**：`formatCount`、`formatFileSize`、`formatPrice` 使用 `toFixed(1)`，即四舍五入到一位小数；极端进位（如 `9999` → `10.0k`）属于预期行为。
- **空值兜底**：日期类返回 `—`，计数类按 0，时长类按 `00:00`；调用方通常无需再判空。
- **金额单位**：输入统一为「分」，与 `@sylvie/types` 中 `*Cents` 字段保持一致。
- **无样式依赖**：`cn` 仅做字符串合并，不做 Tailwind 冲突去重。
- **不逐行包装**：仅收录跨端复用的通用格式化逻辑；业务专用计算留在各应用内。

## 验证

```bash
pnpm --filter @sylvie/utils typecheck
pnpm --filter @sylvie/utils build
pnpm --filter @sylvie/utils lint
```

也可在仓库根目录运行 `pnpm typecheck` / `pnpm build` / `pnpm lint`。
