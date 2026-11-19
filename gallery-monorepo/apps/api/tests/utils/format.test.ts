/**
 * 格式化与分页纯函数测试：会员有效期、有效角色、分页归一化、
 * DATETIME / 订单号生成与 MySQL 类型转换。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createOrderNo,
  effectiveRole,
  isVipActive,
  normalizePage,
  toBool,
  toNumber,
  toPageResult,
  toSqlDateTime,
} from '../../src/utils/format.js';

const NOW = new Date('2026-11-20T10:00:00+08:00');

afterEach(() => {
  vi.useRealTimers();
});

describe('isVipActive', () => {
  it('未设置到期时间时为 false', () => {
    expect(isVipActive(null, NOW)).toBe(false);
    expect(isVipActive(undefined, NOW)).toBe(false);
  });

  it('兼容 MySQL DATETIME 的空格分隔格式', () => {
    expect(isVipActive('2026-12-01 00:00:00', NOW)).toBe(true);
    expect(isVipActive('2026-11-01 00:00:00', NOW)).toBe(false);
  });
});

describe('effectiveRole', () => {
  it('管理员不受会员到期影响', () => {
    expect(effectiveRole('admin', null, NOW)).toBe('admin');
  });

  it('有效期内的付费会员保持 vip', () => {
    expect(effectiveRole('vip', '2026-12-01 00:00:00', NOW)).toBe('vip');
  });

  it('付费会员到期后降级为 member', () => {
    expect(effectiveRole('vip', '2026-01-01 00:00:00', NOW)).toBe('member');
    expect(effectiveRole('vip', null, NOW)).toBe('member');
  });

  it('注册会员始终为 member', () => {
    expect(effectiveRole('member', '2099-01-01 00:00:00', NOW)).toBe('member');
  });
});

describe('normalizePage', () => {
  it('缺省时使用默认页码与默认页大小', () => {
    expect(normalizePage()).toEqual({ page: 1, pageSize: 24, offset: 0 });
  });

  it('页码最小为 1，页大小限制在 1 到上限之间', () => {
    expect(normalizePage(0, 0)).toEqual({ page: 1, pageSize: 1, offset: 0 });
    expect(normalizePage(-5, 999)).toEqual({ page: 1, pageSize: 48, offset: 0 });
  });

  it('按页码与页大小计算 offset', () => {
    expect(normalizePage(3, 10)).toEqual({ page: 3, pageSize: 10, offset: 20 });
  });

  it('小数页码与页大小向下取整', () => {
    expect(normalizePage(2.9, 10.8)).toEqual({ page: 2, pageSize: 10, offset: 10 });
  });
});

describe('toPageResult', () => {
  it('total 为 0 时 totalPages 仍为 1', () => {
    expect(toPageResult([], 0, 1, 24)).toEqual({
      list: [],
      total: 0,
      page: 1,
      pageSize: 24,
      totalPages: 1,
    });
  });

  it('向上取整计算总页数', () => {
    expect(toPageResult([1], 25, 2, 24).totalPages).toBe(2);
    expect(toPageResult([1], 48, 1, 24).totalPages).toBe(2);
    expect(toPageResult([1], 49, 3, 24).totalPages).toBe(3);
  });
});

describe('toSqlDateTime', () => {
  it('输出本地时间格式 YYYY-MM-DD HH:mm:ss', () => {
    expect(toSqlDateTime(new Date(2026, 0, 2, 3, 4, 5))).toBe('2026-01-02 03:04:05');
  });
});

describe('createOrderNo', () => {
  it('形如 SV + 14 位时间 + 4 位随机数', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 20, 9, 8, 7));
    vi.spyOn(Math, 'random').mockReturnValue(0.1234);
    expect(createOrderNo()).toBe('SV202611200908071234');
  });
});

describe('toNumber', () => {
  it('把 DECIMAL 字符串转为数字', () => {
    expect(toNumber('12.50')).toBe(12.5);
    expect(toNumber(3)).toBe(3);
  });

  it('无法转换时返回兜底值', () => {
    expect(toNumber('abc')).toBe(0);
    expect(toNumber(undefined, 8)).toBe(8);
    expect(toNumber(Number.NaN, 5)).toBe(5);
  });
});

describe('toBool', () => {
  it('识别 MySQL 的 0/1 与布尔值', () => {
    expect(toBool(1)).toBe(true);
    expect(toBool('1')).toBe(true);
    expect(toBool(true)).toBe(true);
    expect(toBool(0)).toBe(false);
    expect(toBool('0')).toBe(false);
    expect(toBool(null)).toBe(false);
  });
});
