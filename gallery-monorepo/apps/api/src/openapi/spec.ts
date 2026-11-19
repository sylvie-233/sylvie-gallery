/**
 * API 文档：覆盖前台与管理后台的全部接口。
 *
 * 这里维护一份可读的 OpenAPI 3.1 描述，由 `GET /api/openapi.json` 暴露，
 * `GET /api/docs` 使用 Scalar 渲染。接口实现变更时需同步更新本文件。
 */

const errorResponse = {
  description: '统一失败响应 { code, message, data: null }',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
} as const;

const errorResponses = {
  400: { ...errorResponse, description: '参数错误' },
  401: { ...errorResponse, description: '未登录或登录已失效' },
  403: { ...errorResponse, description: '没有操作权限' },
  404: { ...errorResponse, description: '资源不存在' },
  409: { ...errorResponse, description: '数据冲突或重复操作' },
} as const;

function successResponse(description: string, status = 200): Record<string, unknown> {
  return {
    [status]: {
      description,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiSuccess' } } },
    },
  };
}

interface OperationOptions {
  auth?: boolean;
  parameters?: unknown[];
  requestBody?: unknown;
  responses?: Record<string, unknown>;
}

/** 生成单个 operation；默认需要 Bearer JWT。 */
function operation(
  summary: string,
  tag: string,
  options: OperationOptions = {},
): Record<string, unknown> {
  return {
    summary,
    tags: [tag],
    ...(options.auth === false ? { security: [] } : {}),
    ...(options.parameters ? { parameters: options.parameters } : {}),
    ...(options.requestBody
      ? { requestBody: { required: true, content: { 'application/json': { schema: options.requestBody } } } }
      : {}),
    responses: options.responses ?? { ...successResponse('操作成功'), ...errorResponses },
  };
}

/** 路径参数：正整数 ID。 */
function idParam(name = 'id', description = '资源 ID'): Record<string, unknown> {
  return {
    name,
    in: 'path',
    required: true,
    description,
    schema: { type: 'integer', minimum: 1 },
  };
}

/** 查询参数。 */
function queryParam(
  name: string,
  description: string,
  schema: Record<string, unknown>,
  required = false,
): Record<string, unknown> {
  return { name, in: 'query', required, description, schema };
}

const paginationParams = [
  queryParam('page', '页码，从 1 开始', { type: 'integer', minimum: 1, default: 1 }),
  queryParam('pageSize', '每页条数', { type: 'integer', minimum: 1, maximum: 48, default: 24 }),
];

const pageResponse = () => ({
  ...successResponse('分页列表 { list, total, page, pageSize, totalPages }'),
  ...errorResponses,
});

export const openapiSpec = {
  openapi: '3.1.0',
  info: {
    title: '希尔薇图集 API',
    version: '1.0.0',
    description: [
      '希尔薇图集 v1 API（Hono + MySQL + RustFS）。',
      '',
      '统一响应：成功 `{ code: 200, message, data }`，失败 `{ code, message, data: null }`。',
      '分页统一为 `{ list, total, page, pageSize, totalPages }`。',
      '前台登录态通过 `Authorization: Bearer <token>` 传递；后台接口位于 `/api/admin/*`，需要管理员角色。',
    ].join('\n'),
  },
  servers: [{ url: '/api', description: '当前服务' }],
  tags: [
    { name: '认证', description: '验证码、注册、登录、个人资料、签到' },
    { name: '站点', description: '站点初始化数据与配置' },
    { name: '图集', description: '图集列表/详情、评论、收藏、解锁与下载' },
    { name: '作者', description: '作者列表/详情与订阅' },
    { name: '推荐流', description: '瀑布流「个人推荐」' },
    { name: '标签', description: '前台标签云' },
    { name: '公告', description: '前台公告列表' },
    { name: '订单', description: '会员套餐、开通/续费与我的购买' },
    { name: '个人中心', description: '我的收藏与已订阅作者' },
    { name: '通知', description: '我的通知与已读状态' },
    { name: '文件', description: '对象存储代理读取' },
    { name: '后台 · 认证', description: '管理后台独立登录' },
    { name: '后台 · 看板', description: '数据看板与趋势' },
    { name: '后台 · 图集', description: '图集发布、上下架、推荐与删除' },
    { name: '后台 · 标签', description: '标签新建、改名、隐藏与删除' },
    { name: '后台 · 作者', description: '作者新建、编辑、隐藏与删除' },
    { name: '后台 · 评论', description: '评论审核与删除' },
    { name: '后台 · 公告', description: '公告发布、编辑、上下线与删除' },
    { name: '后台 · 订单', description: '支付流水、退款与导出' },
    { name: '后台 · 用户', description: '用户列表、积分调整、赠送会员、重置密码与封禁' },
    { name: '后台 · 配置', description: '站点配置、会员套餐与友情链接' },
    { name: '后台 · 日志', description: '管理操作日志' },
    { name: '后台 · 上传', description: '图片 / 视频 / 头像上传' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: '登录成功后签发的 JWT；后台接口使用管理后台登录签发的令牌。',
      },
    },
    schemas: {
      ApiSuccess: {
        type: 'object',
        required: ['code', 'message', 'data'],
        properties: {
          code: { type: 'integer', example: 200, description: '业务状态码，成功恒为 200' },
          message: { type: 'string', example: '操作成功' },
          data: { description: '业务数据，可为对象、数组或 null' },
        },
      },
      ApiError: {
        type: 'object',
        required: ['code', 'message', 'data'],
        properties: {
          code: { type: 'integer', example: 400, description: 'HTTP 状态码' },
          message: { type: 'string', example: '参数错误' },
          data: { type: 'null', example: null },
        },
      },
      Pagination: {
        type: 'object',
        required: ['list', 'total', 'page', 'pageSize', 'totalPages'],
        properties: {
          list: { type: 'array', items: { type: 'object' } },
          total: { type: 'integer' },
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
      },
      AdminAlbumSave: {
        type: 'object',
        required: ['title', 'authorId'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 60 },
          authorId: { type: 'integer', minimum: 1 },
          points: { type: 'integer', minimum: 0, maximum: 99, default: 0 },
          description: { type: 'string', maxLength: 1000 },
          tagIds: { type: 'array', maxItems: 8, items: { type: 'integer', minimum: 1 } },
          coverUrl: { type: ['string', 'null'], maxLength: 512 },
          status: { type: 'string', enum: ['draft', 'published', 'offline'] },
          images: {
            type: 'array',
            maxItems: 99,
            items: {
              type: 'object',
              required: ['url'],
              properties: {
                id: { type: 'integer', minimum: 1 },
                url: { type: 'string', maxLength: 512 },
                thumbUrl: { type: ['string', 'null'], maxLength: 512 },
                watermarkUrl: { type: ['string', 'null'], maxLength: 512 },
                width: { type: ['integer', 'null'], minimum: 1 },
                height: { type: ['integer', 'null'], minimum: 1 },
                size: { type: 'number', minimum: 0 },
              },
            },
          },
          videos: {
            type: 'array',
            maxItems: 3,
            items: {
              type: 'object',
              required: ['url'],
              properties: {
                id: { type: 'integer', minimum: 1 },
                url: { type: 'string', maxLength: 512 },
                thumbUrl: { type: ['string', 'null'], maxLength: 512 },
                width: { type: ['integer', 'null'], minimum: 1 },
                height: { type: ['integer', 'null'], minimum: 1 },
                duration: { type: ['integer', 'null'], minimum: 0 },
                size: { type: 'number', minimum: 0 },
              },
            },
          },
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
  paths: {
    // -------------------------------------------------------------------
    // 认证
    // -------------------------------------------------------------------
    '/auth/send-code': {
      post: operation('发送邮箱验证码（注册 / 找回密码）', '认证', {
        auth: false,
        requestBody: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email', maxLength: 128 },
            scene: { type: 'string', enum: ['register', 'reset_password'], default: 'register' },
          },
        },
      }),
    },
    '/auth/register': {
      post: operation('注册会员账号', '认证', {
        auth: false,
        requestBody: {
          type: 'object',
          required: ['nickname', 'email', 'password', 'code'],
          properties: {
            nickname: { type: 'string', minLength: 1, maxLength: 16 },
            email: { type: 'string', format: 'email', maxLength: 128 },
            password: { type: 'string', minLength: 6, maxLength: 64 },
            code: { type: 'string', minLength: 4, maxLength: 8, description: '邮箱验证码' },
          },
        },
        responses: {
          ...successResponse('注册成功，返回登录令牌与用户资料', 201),
          ...errorResponses,
        },
      }),
    },
    '/auth/login': {
      post: operation('登录并签发 JWT', '认证', {
        auth: false,
        requestBody: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', maxLength: 128 },
            password: { type: 'string', minLength: 1, maxLength: 64 },
          },
        },
      }),
    },
    '/auth/me': {
      get: operation('获取当前用户资料', '认证'),
    },
    '/auth/profile': {
      patch: operation('更新昵称与预设头像', '认证', {
        requestBody: {
          type: 'object',
          properties: {
            nickname: { type: 'string', minLength: 1, maxLength: 16 },
            avatarType: { type: 'integer', minimum: 0, maximum: 1, description: '0=预设色卡 1=自定义上传' },
            avatarIndex: { type: 'integer', minimum: 0, maximum: 7 },
          },
        },
      }),
    },
    '/auth/avatar': {
      post: operation('上传自定义头像（≤2MB，jpg/png/webp）', '认证', {
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: { file: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
      }),
    },
    '/auth/checkin': {
      get: operation('查询今日签到状态', '认证'),
      post: operation('每日签到领取解锁积分', '认证'),
    },

    // -------------------------------------------------------------------
    // 站点
    // -------------------------------------------------------------------
    '/site/bootstrap': {
      get: operation('获取前台初始化数据（站点配置、公告、统计等）', '站点', { auth: false }),
    },
    '/site/config': {
      get: operation('获取站点配置键值对', '站点', { auth: false }),
    },

    // -------------------------------------------------------------------
    // 图集
    // -------------------------------------------------------------------
    '/albums': {
      get: operation('图集列表（最新 / 热门 / 收藏，支持标签与关键词筛选）', '图集', {
        auth: false,
        parameters: [
          ...paginationParams,
          queryParam('sort', '排序方式', { type: 'string', enum: ['new', 'hot', 'fav'], default: 'new' }),
          queryParam('tag', '标签名（可带或不带 # 前缀）', { type: 'string', maxLength: 32 }),
          queryParam('keyword', '标题/作者/标签关键词', { type: 'string', maxLength: 64 }),
          queryParam('authorId', '按作者筛选', { type: 'integer', minimum: 1 }),
        ],
        responses: pageResponse(),
      }),
    },
    '/albums/{id}': {
      get: operation('图集详情（未解锁仅返回前 3 张预览）', '图集', {
        auth: false,
        parameters: [idParam('id', '图集 ID')],
      }),
    },
    '/albums/{id}/comments': {
      post: operation('发表评论（先审后发）', '图集', {
        parameters: [idParam('id', '图集 ID')],
        requestBody: {
          type: 'object',
          required: ['content'],
          properties: {
            content: { type: 'string', minLength: 1, maxLength: 500 },
            parentId: { type: ['integer', 'null'], minimum: 1, description: '父评论 ID，回复时必填' },
            replyToUserId: { type: ['integer', 'null'], minimum: 1 },
          },
        },
        responses: {
          ...successResponse('评论已提交，审核通过后展示', 201),
          ...errorResponses,
        },
      }),
    },
    '/albums/{id}/favorite': {
      post: operation('切换图集收藏状态', '图集', {
        parameters: [idParam('id', '图集 ID')],
      }),
    },
    '/albums/{id}/unlock': {
      post: operation('消耗解锁积分永久解锁图集', '图集', {
        parameters: [idParam('id', '图集 ID')],
      }),
    },
    '/albums/{id}/download': {
      get: operation('打包下载原图 ZIP（需已解锁或付费会员）', '图集', {
        parameters: [idParam('id', '图集 ID')],
        responses: {
          200: {
            description: 'ZIP 文件流',
            content: { 'application/zip': { schema: { type: 'string', format: 'binary' } } },
          },
          ...errorResponses,
        },
      }),
    },

    // -------------------------------------------------------------------
    // 作者 / 推荐流 / 标签 / 公告
    // -------------------------------------------------------------------
    '/authors': {
      get: operation('作者列表（支持姓名 / 别名 / 风格搜索）', '作者', {
        auth: false,
        parameters: [queryParam('keyword', '姓名 / 别名 / 风格关键词', { type: 'string', maxLength: 32 })],
      }),
    },
    '/authors/{id}': {
      get: operation('作者详情与其图集列表', '作者', {
        auth: false,
        parameters: [
          idParam('id', '作者 ID'),
          queryParam('page', '页码', { type: 'integer', minimum: 1, default: 1 }),
          queryParam('pageSize', '每页条数', { type: 'integer', minimum: 1, maximum: 36, default: 12 }),
        ],
      }),
    },
    '/authors/{id}/subscribe': {
      post: operation('切换作者订阅状态', '作者', {
        parameters: [idParam('id', '作者 ID')],
      }),
    },
    '/feed': {
      get: operation('瀑布流「个人推荐」（登录后按浏览偏好）', '推荐流', {
        auth: false,
        parameters: [
          queryParam('page', '页码', { type: 'integer', minimum: 1, default: 1 }),
          queryParam('pageSize', '每页条数', { type: 'integer', minimum: 1, maximum: 36, default: 24 }),
        ],
        responses: pageResponse(),
      }),
    },
    '/tags': {
      get: operation('标签云（按收录套数分级）', '标签', { auth: false }),
    },
    '/announcements': {
      get: operation('公告列表（置顶优先，支持关键词搜索）', '公告', {
        auth: false,
        parameters: [
          ...paginationParams,
          queryParam('keyword', '标题 / 摘要 / 正文关键词', { type: 'string', maxLength: 64 }),
        ],
        responses: pageResponse(),
      }),
    },

    // -------------------------------------------------------------------
    // 订单 / 个人中心 / 通知 / 评论
    // -------------------------------------------------------------------
    '/orders/plans': {
      get: operation('会员套餐列表', '订单', { auth: false }),
    },
    '/orders/vip': {
      post: operation('创建会员开通 / 续费订单', '订单', {
        requestBody: {
          type: 'object',
          required: ['planCode'],
          properties: { planCode: { type: 'string', maxLength: 32, example: 'monthly' } },
        },
      }),
    },
    '/orders/{orderNo}/pay': {
      post: operation('支付订单（本地开发为模拟支付）', '订单', {
        parameters: [
          {
            name: 'orderNo',
            in: 'path',
            required: true,
            description: '订单号',
            schema: { type: 'string', pattern: '^[A-Za-z0-9]{8,32}$' },
          },
        ],
      }),
    },
    '/orders/mine': {
      get: operation('我的购买（订单与图集解锁记录）', '订单', {
        parameters: [
          queryParam('ordersPage', '订单页码', { type: 'integer', minimum: 1 }),
          queryParam('unlocksPage', '解锁记录页码', { type: 'integer', minimum: 1 }),
          queryParam('pageSize', '每页条数', { type: 'integer', minimum: 1, maximum: 24 }),
        ],
      }),
    },
    '/me/favorites': {
      get: operation('我的收藏图集', '个人中心', {
        parameters: [
          queryParam('page', '页码', { type: 'integer', minimum: 1 }),
          queryParam('pageSize', '每页条数', { type: 'integer', minimum: 1, maximum: 36 }),
        ],
        responses: pageResponse(),
      }),
    },
    '/me/subscriptions': {
      get: operation('我订阅的作者', '个人中心', {
        parameters: [
          queryParam('page', '页码', { type: 'integer', minimum: 1 }),
          queryParam('pageSize', '每页条数', { type: 'integer', minimum: 1, maximum: 36 }),
        ],
        responses: pageResponse(),
      }),
    },
    '/notifications': {
      get: operation('我的通知（未读红点、分页）', '通知', {
        parameters: [
          queryParam('page', '页码', { type: 'integer', minimum: 1 }),
          queryParam('pageSize', '每页条数', { type: 'integer', minimum: 1, maximum: 24 }),
          queryParam('filter', '筛选', { type: 'string', enum: ['all', 'unread'] }),
        ],
        responses: pageResponse(),
      }),
    },
    '/notifications/{id}/read': {
      post: operation('标记单条通知为已读', '通知', { parameters: [idParam('id', '通知 ID')] }),
    },
    '/notifications/read-all': {
      post: operation('全部通知标记为已读', '通知'),
    },
    '/comments/{id}': {
      delete: operation('删除本人评论', '图集', { parameters: [idParam('id', '评论 ID')] }),
    },

    // -------------------------------------------------------------------
    // 文件
    // -------------------------------------------------------------------
    '/files/{key}': {
      get: operation('对象存储代理读取（avatars/ albums/ authors/ 前缀）', '文件', {
        auth: false,
        parameters: [
          {
            name: 'key',
            in: 'path',
            required: true,
            description: '对象键，如 albums/1/cover.webp',
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: '文件二进制流',
            content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
          },
          ...errorResponses,
        },
      }),
    },

    // -------------------------------------------------------------------
    // 管理后台 · 认证
    // -------------------------------------------------------------------
    '/admin/auth/login': {
      post: operation('管理后台登录（仅 admin 角色）', '后台 · 认证', {
        auth: false,
        requestBody: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', maxLength: 128, description: '邮箱，或演示账号简写 admin' },
            password: { type: 'string', minLength: 1, maxLength: 64 },
          },
        },
      }),
    },
    '/admin/auth/me': {
      get: operation('获取当前管理员资料', '后台 · 认证'),
    },

    // -------------------------------------------------------------------
    // 管理后台 · 看板
    // -------------------------------------------------------------------
    '/admin/dashboard': {
      get: operation('数据看板统计', '后台 · 看板'),
    },
    '/admin/dashboard/trend': {
      get: operation('数据趋势', '后台 · 看板', {
        parameters: [
          queryParam('mode', '时间范围', { type: 'string', enum: ['7d', '30d', '6m'], default: '7d' }),
        ],
      }),
    },

    // -------------------------------------------------------------------
    // 管理后台 · 图集
    // -------------------------------------------------------------------
    '/admin/albums': {
      get: operation('后台图集列表', '后台 · 图集', {
        parameters: [
          ...paginationParams,
          queryParam('status', '状态筛选', { type: 'string', enum: ['all', 'published', 'draft', 'offline'] }),
          queryParam('keyword', '标题 / 作者关键词', { type: 'string', maxLength: 64 }),
        ],
        responses: pageResponse(),
      }),
      post: operation('发布 / 保存图集', '后台 · 图集', {
        requestBody: { $ref: '#/components/schemas/AdminAlbumSave' },
        responses: {
          ...successResponse('图集已保存', 201),
          ...errorResponses,
        },
      }),
    },
    '/admin/albums/{id}': {
      get: operation('后台图集详情（含全部媒体）', '后台 · 图集', { parameters: [idParam('id', '图集 ID')] }),
      put: operation('更新图集', '后台 · 图集', {
        parameters: [idParam('id', '图集 ID')],
        requestBody: { $ref: '#/components/schemas/AdminAlbumSave' },
      }),
      delete: operation('删除图集（软删除）', '后台 · 图集', { parameters: [idParam('id', '图集 ID')] }),
    },
    '/admin/albums/{id}/status': {
      post: operation('发布 / 下架图集', '后台 · 图集', {
        parameters: [idParam('id', '图集 ID')],
        requestBody: {
          type: 'object',
          required: ['status'],
          properties: { status: { type: 'string', enum: ['published', 'offline'] } },
        },
      }),
    },
    '/admin/albums/{id}/recommend': {
      post: operation('加入 / 移出瀑布流推荐池', '后台 · 图集', {
        parameters: [idParam('id', '图集 ID')],
      }),
    },

    // -------------------------------------------------------------------
    // 管理后台 · 标签
    // -------------------------------------------------------------------
    '/admin/tags': {
      get: operation('后台标签列表', '后台 · 标签', {
        parameters: [
          ...paginationParams,
          queryParam('status', '状态筛选', { type: 'string', enum: ['all', 'on', 'off'] }),
          queryParam('keyword', '标签名关键词', { type: 'string', maxLength: 32 }),
        ],
        responses: pageResponse(),
      }),
      post: operation('新建标签', '后台 · 标签', {
        requestBody: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string', minLength: 1, maxLength: 20 } },
        },
        responses: {
          ...successResponse('标签已创建', 201),
          ...errorResponses,
        },
      }),
    },
    '/admin/tags/{id}': {
      put: operation('重命名标签', '后台 · 标签', {
        parameters: [idParam('id', '标签 ID')],
        requestBody: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string', minLength: 1, maxLength: 20 } },
        },
      }),
      delete: operation('删除标签（仅未被收录可删）', '后台 · 标签', {
        parameters: [idParam('id', '标签 ID')],
      }),
    },
    '/admin/tags/{id}/toggle': {
      post: operation('显示 / 隐藏标签', '后台 · 标签', { parameters: [idParam('id', '标签 ID')] }),
    },

    // -------------------------------------------------------------------
    // 管理后台 · 作者
    // -------------------------------------------------------------------
    '/admin/authors': {
      get: operation('后台作者列表', '后台 · 作者', {
        parameters: [
          ...paginationParams,
          queryParam('status', '状态筛选', { type: 'string', enum: ['all', 'on', 'off'] }),
          queryParam('keyword', '姓名 / 别名关键词', { type: 'string', maxLength: 64 }),
        ],
        responses: pageResponse(),
      }),
      post: operation('新建作者', '后台 · 作者', {
        requestBody: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 32 },
            alias: { type: 'string', maxLength: 64 },
            initial: { type: 'string', maxLength: 8 },
            color: { type: 'string', maxLength: 16 },
            avatarUrl: { type: ['string', 'null'], maxLength: 512 },
            bio: { type: 'string', maxLength: 500 },
            styleTags: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 16 } },
            sortWeight: { type: 'integer', minimum: -9999, maximum: 9999 },
          },
        },
        responses: {
          ...successResponse('作者已创建', 201),
          ...errorResponses,
        },
      }),
    },
    '/admin/authors/{id}': {
      put: operation('更新作者资料', '后台 · 作者', {
        parameters: [idParam('id', '作者 ID')],
        requestBody: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 32 },
            alias: { type: 'string', maxLength: 64 },
            initial: { type: 'string', maxLength: 8 },
            color: { type: 'string', maxLength: 16 },
            avatarUrl: { type: ['string', 'null'], maxLength: 512 },
            bio: { type: 'string', maxLength: 500 },
            styleTags: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 16 } },
            sortWeight: { type: 'integer', minimum: -9999, maximum: 9999 },
          },
        },
      }),
      delete: operation('删除作者（软删除）', '后台 · 作者', { parameters: [idParam('id', '作者 ID')] }),
    },
    '/admin/authors/{id}/toggle': {
      post: operation('显示 / 隐藏作者', '后台 · 作者', { parameters: [idParam('id', '作者 ID')] }),
    },

    // -------------------------------------------------------------------
    // 管理后台 · 评论 / 公告
    // -------------------------------------------------------------------
    '/admin/comments': {
      get: operation('后台评论列表', '后台 · 评论', {
        parameters: [
          ...paginationParams,
          queryParam('status', '审核状态', { type: 'string', enum: ['pending', 'approved', 'rejected'] }),
          queryParam('keyword', '评论内容关键词', { type: 'string', maxLength: 64 }),
          queryParam('from', '开始日期', { type: 'string', format: 'date' }),
          queryParam('to', '结束日期', { type: 'string', format: 'date' }),
        ],
        responses: pageResponse(),
      }),
    },
    '/admin/comments/{id}': {
      delete: operation('删除评论', '后台 · 评论', { parameters: [idParam('id', '评论 ID')] }),
    },
    '/admin/comments/{id}/review': {
      post: operation('审核通过 / 拒绝评论', '后台 · 评论', {
        parameters: [idParam('id', '评论 ID')],
        requestBody: {
          type: 'object',
          required: ['status'],
          properties: { status: { type: 'string', enum: ['approved', 'rejected'] } },
        },
      }),
    },
    '/admin/announcements': {
      get: operation('后台公告列表', '后台 · 公告', {
        parameters: [
          ...paginationParams,
          queryParam('type', '公告类型', {
            type: 'string',
            enum: ['update', 'activity', 'maintain', 'rule', 'notice'],
          }),
          queryParam('status', '发布状态', { type: 'string', enum: ['0', '1'] }),
          queryParam('keyword', '标题 / 摘要 / 正文关键词', { type: 'string', maxLength: 128 }),
          queryParam('from', '开始日期', { type: 'string', format: 'date' }),
          queryParam('to', '结束日期', { type: 'string', format: 'date' }),
        ],
        responses: pageResponse(),
      }),
      post: operation('发布公告', '后台 · 公告', {
        requestBody: {
          type: 'object',
          required: ['type', 'title'],
          properties: {
            type: { type: 'string', enum: ['update', 'activity', 'maintain', 'rule', 'notice'] },
            title: { type: 'string', minLength: 1, maxLength: 128 },
            summary: { type: 'string', maxLength: 255 },
            content: { type: 'string', maxLength: 20000 },
            isTop: { type: 'boolean' },
          },
        },
        responses: {
          ...successResponse('公告已发布', 201),
          ...errorResponses,
        },
      }),
    },
    '/admin/announcements/{id}': {
      put: operation('更新公告', '后台 · 公告', {
        parameters: [idParam('id', '公告 ID')],
        requestBody: {
          type: 'object',
          required: ['type', 'title'],
          properties: {
            type: { type: 'string', enum: ['update', 'activity', 'maintain', 'rule', 'notice'] },
            title: { type: 'string', minLength: 1, maxLength: 128 },
            summary: { type: 'string', maxLength: 255 },
            content: { type: 'string', maxLength: 20000 },
            isTop: { type: 'boolean' },
          },
        },
      }),
      delete: operation('删除公告（软删除）', '后台 · 公告', { parameters: [idParam('id', '公告 ID')] }),
    },
    '/admin/announcements/{id}/toggle': {
      post: operation('发布 / 下线公告', '后台 · 公告', { parameters: [idParam('id', '公告 ID')] }),
    },

    // -------------------------------------------------------------------
    // 管理后台 · 订单 / 用户
    // -------------------------------------------------------------------
    '/admin/orders': {
      get: operation('后台支付流水', '后台 · 订单', {
        parameters: [
          ...paginationParams,
          queryParam('biz', '业务类型', { type: 'string', enum: ['all', 'vip', 'unlock'] }),
          queryParam('status', '订单状态', {
            type: 'string',
            enum: ['all', 'created', 'paid', 'refunded', 'closed'],
          }),
          queryParam('keyword', '订单号 / 用户关键词', { type: 'string', maxLength: 64 }),
          queryParam('from', '开始日期', { type: 'string', format: 'date' }),
          queryParam('to', '结束日期', { type: 'string', format: 'date' }),
        ],
        responses: pageResponse(),
      }),
    },
    '/admin/orders/export': {
      get: operation('导出支付流水 CSV', '后台 · 订单', {
        parameters: [
          queryParam('biz', '业务类型', { type: 'string', enum: ['all', 'vip', 'unlock'] }),
          queryParam('status', '订单状态', {
            type: 'string',
            enum: ['all', 'created', 'paid', 'refunded', 'closed'],
          }),
          queryParam('keyword', '订单号 / 用户关键词', { type: 'string', maxLength: 64 }),
          queryParam('from', '开始日期', { type: 'string', format: 'date' }),
          queryParam('to', '结束日期', { type: 'string', format: 'date' }),
        ],
        responses: {
          200: {
            description: 'CSV 文件流；筛选结果为空时返回统一 JSON 响应',
            content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } },
          },
          ...errorResponses,
        },
      }),
    },
    '/admin/orders/{id}/refund': {
      post: operation('退款并收回会员权益', '后台 · 订单', {
        parameters: [idParam('id', '订单 ID')],
        requestBody: {
          type: 'object',
          properties: { reason: { type: 'string', maxLength: 255 } },
        },
      }),
    },
    '/admin/users': {
      get: operation('后台用户列表', '后台 · 用户', {
        parameters: [
          ...paginationParams,
          queryParam('role', '角色', { type: 'string', enum: ['all', 'admin', 'vip', 'member'] }),
          queryParam('status', '状态', { type: 'string', enum: ['all', '0', '1'] }),
          queryParam('keyword', '邮箱 / 昵称关键词', { type: 'string', maxLength: 64 }),
        ],
        responses: pageResponse(),
      }),
    },
    '/admin/users/{id}/points': {
      post: operation('调整用户解锁积分', '后台 · 用户', {
        parameters: [idParam('id', '用户 ID')],
        requestBody: {
          type: 'object',
          required: ['delta', 'reason'],
          properties: {
            delta: { type: 'integer', minimum: -99999, maximum: 99999, description: '正数增加，负数扣减' },
            reason: { type: 'string', minLength: 1, maxLength: 64 },
          },
        },
      }),
    },
    '/admin/users/{id}/grant-vip': {
      post: operation('赠送 30 天付费会员（生成 0 元订单留痕）', '后台 · 用户', {
        parameters: [idParam('id', '用户 ID')],
      }),
    },
    '/admin/users/{id}/reset-password': {
      post: operation('重置用户密码为默认值', '后台 · 用户', { parameters: [idParam('id', '用户 ID')] }),
    },
    '/admin/users/{id}/toggle-status': {
      post: operation('封禁 / 解封用户', '后台 · 用户', { parameters: [idParam('id', '用户 ID')] }),
    },

    // -------------------------------------------------------------------
    // 管理后台 · 配置 / 日志 / 上传
    // -------------------------------------------------------------------
    '/admin/config': {
      get: operation('获取站点配置、会员套餐与友情链接', '后台 · 配置'),
    },
    '/admin/config/site': {
      put: operation('保存站点配置', '后台 · 配置', {
        requestBody: {
          type: 'object',
          properties: {
            copyright: { type: 'string', maxLength: 255 },
            icpNo: { type: 'string', maxLength: 64 },
            ageStatement: { type: 'string', maxLength: 255 },
            disclaimer: { type: 'string', maxLength: 255 },
            checkinPoints: { type: 'integer', minimum: 1, maximum: 99, default: 2 },
            watermarkOn: { type: 'boolean', default: true },
          },
        },
      }),
    },
    '/admin/config/plan': {
      put: operation('保存会员套餐（价格 / 天数 / 权益文案）', '后台 · 配置', {
        requestBody: {
          type: 'object',
          required: ['priceCents', 'durationDays', 'benefits'],
          properties: {
            priceCents: { type: 'integer', minimum: 1, maximum: 1000000, description: '单位：分' },
            durationDays: { type: 'integer', minimum: 1, maximum: 365 },
            benefits: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'string', maxLength: 100 } },
          },
        },
      }),
    },
    '/admin/config/friends': {
      post: operation('新增友情链接', '后台 · 配置', {
        requestBody: {
          type: 'object',
          required: ['name', 'url'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 32 },
            slogan: { type: 'string', maxLength: 64 },
            url: { type: 'string', minLength: 1, maxLength: 255 },
          },
        },
        responses: {
          ...successResponse('友链已添加', 201),
          ...errorResponses,
        },
      }),
    },
    '/admin/config/friends/{id}': {
      delete: operation('删除友情链接', '后台 · 配置', { parameters: [idParam('id', '友链 ID')] }),
    },
    '/admin/logs': {
      get: operation('管理操作日志', '后台 · 日志', {
        parameters: [
          ...paginationParams,
          queryParam('action', '动作筛选，如 album.publish', { type: 'string', maxLength: 64 }),
          queryParam('keyword', '详情关键词', { type: 'string', maxLength: 128 }),
          queryParam('from', '开始日期', { type: 'string', format: 'date' }),
          queryParam('to', '结束日期', { type: 'string', format: 'date' }),
        ],
        responses: pageResponse(),
      }),
    },
    '/admin/upload': {
      post: operation('上传图片 / 视频 / 头像', '后台 · 上传', {
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  file: { type: 'string', format: 'binary' },
                  kind: { type: 'string', enum: ['image', 'video', 'avatar'], default: 'image' },
                },
              },
            },
          },
        },
        responses: {
          ...successResponse('上传成功，返回 URL 与尺寸信息', 201),
          ...errorResponses,
        },
      }),
    },
  },
} as const;
