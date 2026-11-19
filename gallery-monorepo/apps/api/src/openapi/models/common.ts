/**
 * OpenAPI 公共模型：枚举、统一响应包装、分页、路径参数与错误响应。
 * 这里定义的 schema 会被各路由的 createRoute 复用，也是运行时校验的同一份定义。
 */
import { z } from '@hono/zod-openapi';

/* ========================= 枚举 ========================= */

// 用户角色：member=注册会员，vip=付费会员，admin=管理员；游客不落库。
export const roleSchema = z.enum(['member', 'vip', 'admin']).openapi('Role');
// 有效角色：会员过期后由任务降级为 member，前端统一读取该字段。
export const effectiveRoleSchema = roleSchema;
// 图集排序：最新 / 热门 / 收藏。
export const sortTypeSchema = z.enum(['new', 'hot', 'fav']).openapi('SortType');
// 发布状态：草稿 / 已发布 / 已下架；前台仅可见 published。
export const albumStatusSchema = z.enum(['draft', 'published', 'offline']).openapi('AlbumStatus');
// 公告类型：更新 / 活动 / 维护 / 规则 / 通知。
export const announcementTypeSchema = z
  .enum(['update', 'activity', 'maintain', 'rule', 'notice'])
  .openapi('AnnouncementType');
// 通知类型：审核结果 / 图集更新 / 会员权益 / 系统消息。
export const notificationTypeSchema = z
  .enum(['review', 'update', 'benefit', 'system'])
  .openapi('NotificationType');
// 评论状态：待审核 / 通过 / 驳回 / 已删除（软删除）。
export const commentStatusSchema = z
  .enum(['pending', 'approved', 'rejected', 'deleted'])
  .openapi('CommentStatus');
// 订单状态：待支付 / 已支付 / 已关闭 / 已退款。
export const orderStatusSchema = z
  .enum(['created', 'paid', 'closed', 'refunded'])
  .openapi('OrderStatus');
// 支付方式：支付宝 / 积分抵扣 / 后台赠送（0 元订单）。
export const payTypeSchema = z.enum(['alipay', 'points', 'admin']).openapi('PayType');
// 媒体类型：图片 / 视频。
export const mediaTypeSchema = z.enum(['image', 'video']).openapi('MediaType');

/* ========================= 响应包装 ========================= */

// 统一失败响应：HTTP 状态与业务 code 一致，data 恒为 null。
export const ErrorResponseSchema = z
  .object({
    code: z.number().int().openapi({ example: 400 }),
    message: z.string().openapi({ example: '请求参数错误' }),
    data: z.null(),
  })
  .openapi('ErrorResponse');

export function jsonContent<T extends z.ZodTypeAny>(schema: T) {
  return { 'application/json': { schema } };
}

function ok<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    code: z.literal(200).openapi({ example: 200, description: '业务状态码，成功恒为 200' }),
    message: z.string().openapi({ example: '操作成功' }),
    data,
  });
}

/** 声明一个成功响应：data 使用具体模型。 */
export function successResponse<T extends z.ZodTypeAny>(data: T, description = '操作成功') {
  return {
    description,
    content: jsonContent(ok(data)),
  };
}

/** 声明 JSON 请求体。 */
export function jsonBody<T extends z.ZodTypeAny>(schema: T) {
  return {
    content: jsonContent(schema),
    required: true as const,
  };
}

/** 声明二进制响应。 */
export function binaryResponse(contentType: string, description: string) {
  return {
    description,
    content: {
      [contentType]: {
        schema: z.string().openapi({ type: 'string', format: 'binary' }),
      },
    },
  };
}

export const errorResponses = {
  400: {
    content: jsonContent(ErrorResponseSchema),
    description: '参数错误',
  },
  401: {
    content: jsonContent(ErrorResponseSchema),
    description: '未登录或登录已失效',
  },
  403: {
    content: jsonContent(ErrorResponseSchema),
    description: '没有操作权限',
  },
  404: {
    content: jsonContent(ErrorResponseSchema),
    description: '资源不存在',
  },
  409: {
    content: jsonContent(ErrorResponseSchema),
    description: '数据冲突或重复操作',
  },
} as const;

/* ========================= 分页 ========================= */

// 统一分页结构：page 从 1 开始，totalPages 由后端计算，前端不再自行推导。
export function pageResult<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    list: z.array(item),
    total: z.number().int().openapi({ description: '总条数' }),
    page: z.number().int(),
    pageSize: z.number().int(),
    totalPages: z.number().int(),
  });
}

/* ========================= 路径参数 ========================= */

const pathIdSchema = (name: string, description: string, example: number) =>
  z.coerce.number().int().positive().openapi({
    param: { name, in: 'path' },
    description,
    example,
  });

export const idParamsSchema = z.object({
  id: pathIdSchema('id', '资源 ID', 1),
});

// 订单号形如 SV202611170001，长度限制避免被当作任意字符串探测。
export const orderNoParamsSchema = z.object({
  orderNo: z.string().min(8).max(32).openapi({
    param: { name: 'orderNo', in: 'path' },
    description: '订单号',
    example: 'SV202611170001',
  }),
});

/* ========================= 通用结果 ========================= */

export const nullSchema = z.null();

export const unreadCountSchema = z.object({ unread: z.number().int() }).openapi('UnreadCount');
