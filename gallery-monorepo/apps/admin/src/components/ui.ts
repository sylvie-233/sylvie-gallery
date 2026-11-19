/**
 * 后台组件统一出口：
 * - 通用后台视觉组件来自 `@sylvie/ui/admin`；
 * - 依赖后台日期工具的时间筛选留在本应用。
 */
export * from '@sylvie/ui/admin';
export { TimeRangePicker } from './time-range-picker';
