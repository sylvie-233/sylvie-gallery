/** 后端统一响应结构：code 与 HTTP 状态码一致，成功时 code=200。 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

/** 分页结果：totalPages 由后端统一计算，前端可直接渲染页码。 */
export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
