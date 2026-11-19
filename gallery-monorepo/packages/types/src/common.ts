/**
 * 通用响应结构：全站 API 统一返回 `{ code, message, data }`，
 * 分页接口统一返回 `{ list, total, page, pageSize, totalPages }`。
 */

/**
 * 后端统一响应包装。
 * - `code` 与 HTTP 状态码一致，成功时为 200，失败时由业务错误码给出；
 * - `message` 为可直接展示的中文提示；
 * - `data` 为业务负载，错误响应时通常为 `null`。
 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

/**
 * 分页结果。
 * - `list` 当前页数据；`total` 满足条件的总条数；
 * - `page` 从 1 开始；`pageSize` 为每页条数；
 * - `totalPages` 由后端统一计算（`ceil(total / pageSize)`），前端可直接渲染页码。
 */
export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
