import { z } from '@hono/zod-openapi';

/* ========================= 枚举 ========================= */

export const roleSchema = z.enum(['member', 'vip', 'admin']).openapi('Role');
export const effectiveRoleSchema = roleSchema;
export const sortTypeSchema = z.enum(['new', 'hot', 'fav']).openapi('SortType');
export const albumStatusSchema = z.enum(['draft', 'published', 'offline']).openapi('AlbumStatus');
export const announcementTypeSchema = z
  .enum(['update', 'activity', 'maintain', 'rule', 'notice'])
  .openapi('AnnouncementType');
export const notificationTypeSchema = z
  .enum(['review', 'update', 'benefit', 'system'])
  .openapi('NotificationType');
export const commentStatusSchema = z
  .enum(['pending', 'approved', 'rejected', 'deleted'])
  .openapi('CommentStatus');
export const orderStatusSchema = z
  .enum(['created', 'paid', 'closed', 'refunded'])
  .openapi('OrderStatus');
export const payTypeSchema = z.enum(['alipay', 'points', 'admin']).openapi('PayType');
export const mediaTypeSchema = z.enum(['image', 'video']).openapi('MediaType');

/* ========================= 响应包装 ========================= */

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
