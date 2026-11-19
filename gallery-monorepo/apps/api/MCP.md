# 希尔薇图集 API · MCP 接入

API 暴露一个标准的 **MCP Streamable HTTP** 端点，供 WorkBuddy、Claude、Cursor 等 agent 工具直接查询与操作项目。

## 1. 启用

`.env`：

```env
MCP_ENABLED=true
# true 时才注册管理写操作工具（上下架、审核、积分、配置等）
MCP_ALLOW_WRITE=true
```

重启 API 后生效。端点：

```
http://localhost:3000/api/mcp
```

## 2. 创建 Agent 令牌

推荐使用独立令牌，而不是管理员登录 JWT：

1. 登录管理后台 → 左侧「系统 → Agent 令牌」；
2. 新建令牌，选择：
   - **只读**：只能调用查询工具；
   - **读写**：可调用管理写操作工具（仍需 `MCP_ALLOW_WRITE=true`）；
   - 有效期：7 / 30 / 90 天或永久；
3. 创建后立即复制明文令牌（形如 `svt_xxx`）。**明文只展示一次**，数据库只保存 SHA-256 哈希。

也可以直接调用后台接口创建（需要管理员 JWT）：

```bash
curl -X POST http://localhost:3000/api/admin/agent-tokens \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name":"WorkBuddy 只读","scope":"read","expiresInDays":30}'
```

## 3. 客户端配置

### 通用 MCP 客户端

```json
{
  "mcpServers": {
    "sylvie-gallery": {
      "type": "streamable-http",
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "X-API-Key": "svt_你的令牌"
      }
    }
  }
}
```

也支持把令牌放在 `Authorization`：

```
Authorization: Bearer svt_你的令牌
```

服务端同时兼容管理员 JWT（`Authorization: Bearer <jwt>`），便于 curl / 调试；生产环境建议统一使用 Agent 令牌。

### curl 验证

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "X-API-Key: svt_你的令牌" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {},
      "clientInfo": { "name": "curl", "version": "1.0" }
    }
  }'
```

## 4. 工具清单

### 只读（read 令牌可用）

| 工具 | 说明 |
|---|---|
| `list_albums` | 前台图集列表（排序/标签/关键词/作者） |
| `get_album` | 图集详情、媒体、评论、解锁状态（会记录一次浏览） |
| `list_authors` / `get_author` | 作者列表与详情 |
| `list_tags` / `list_announcements` | 标签云与公告 |
| `admin_dashboard` / `admin_trend` | 后台看板与营收趋势 |
| `admin_list_albums` / `admin_get_album` | 后台图集（含草稿/下架） |
| `admin_list_tags` / `admin_list_authors` | 后台标签与作者 |
| `admin_list_comments` / `admin_list_announcements` | 后台评论与公告 |
| `admin_list_orders` / `admin_list_users` | 订单流水与用户 |
| `admin_get_config` / `admin_list_logs` | 站点配置与操作日志 |

### 写操作（write 令牌 + `MCP_ALLOW_WRITE=true`）

| 工具 | 说明 |
|---|---|
| `admin_update_album_status` | 发布 / 下架图集 |
| `admin_toggle_album_recommend` | 加入 / 移出推荐池 |
| `admin_review_comment` | 审核通过 / 拒绝评论 |
| `admin_adjust_user_points` | 调整用户积分（必须填写原因） |
| `admin_grant_vip` | 赠送 30 天付费会员 |
| `admin_toggle_user_status` | 封禁 / 解封用户 |
| `admin_update_site_config` | 增量更新站点配置 |
| `admin_update_plan` | 更新会员套餐 |
| `admin_create_tag` / `admin_toggle_tag` | 新建 / 显示隐藏标签 |
| `admin_toggle_author` | 显示 / 隐藏作者 |
| `admin_toggle_announcement` | 发布 / 下线公告 |

所有写操作都会以令牌创建管理员的身份写入 `admin_op_log`；令牌会记录 `last_used_at`，可在后台随时吊销，吊销后立即失效。

## 5. 安全建议

- 生产环境使用 HTTPS，并把令牌放在 Secret 管理器 / 客户端安全配置中；
- agent 只需要查询时创建 **只读** 令牌；
- 为不同 agent 创建独立令牌，便于分别吊销与追溯；
- 定期查看「Agent 令牌」的最近使用时间，吊销长期未使用或异常的令牌。
