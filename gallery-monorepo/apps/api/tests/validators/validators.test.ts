/**
 * Zod 校验器测试：查询参数的数字转换与上限、枚举约束、文本长度、
 * 默认值以及邮箱 / 密码等账号字段规则。
 */
import { describe, expect, it } from 'vitest';

import {
  albumListSchema,
  authorDetailSchema,
  authorListSchema,
  commentSchema,
  feedQuerySchema,
  pageQuerySchema,
} from '../../src/validators/albums.js';
import { emailSchema, loginSchema, profileSchema, registerSchema, sendCodeSchema } from '../../src/validators/auth.js';
import {
  announcementListSchema,
  createVipSchema,
  notificationQuerySchema,
  purchasesQuerySchema,
} from '../../src/validators/misc.js';

describe('albumListSchema', () => {
  it('空对象可通过，分页字段保持可选', () => {
    expect(albumListSchema.parse({})).toEqual({});
  });

  it('把查询字符串转成数字', () => {
    expect(albumListSchema.parse({ page: '2', pageSize: '12', authorId: '3' })).toEqual({
      page: 2,
      pageSize: 12,
      authorId: 3,
    });
  });

  it('页大小上限为 48', () => {
    expect(albumListSchema.safeParse({ pageSize: 48 }).success).toBe(true);
    expect(albumListSchema.safeParse({ pageSize: 49 }).success).toBe(false);
  });

  it('页码与作者 ID 必须为正整数', () => {
    expect(albumListSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(albumListSchema.safeParse({ authorId: -1 }).success).toBe(false);
    expect(albumListSchema.safeParse({ page: 'abc' }).success).toBe(false);
  });

  it('排序只接受 new / hot / fav', () => {
    for (const sort of ['new', 'hot', 'fav']) {
      expect(albumListSchema.safeParse({ sort }).success).toBe(true);
    }
    expect(albumListSchema.safeParse({ sort: 'random' }).success).toBe(false);
  });

  it('关键词与标签去空格并限制长度', () => {
    expect(albumListSchema.parse({ keyword: '  冬日  ' }).keyword).toBe('冬日');
    expect(albumListSchema.safeParse({ keyword: 'x'.repeat(65) }).success).toBe(false);
    expect(albumListSchema.safeParse({ tag: 'x'.repeat(33) }).success).toBe(false);
  });
});

describe('commentSchema', () => {
  it('内容去空格后不能为空', () => {
    expect(commentSchema.safeParse({ content: '   ' }).success).toBe(false);
    expect(commentSchema.parse({ content: ' 好看 ' }).content).toBe('好看');
  });

  it('内容最多 500 字', () => {
    expect(commentSchema.safeParse({ content: 'x'.repeat(500) }).success).toBe(true);
    expect(commentSchema.safeParse({ content: 'x'.repeat(501) }).success).toBe(false);
  });

  it('父评论与被回复用户可为空或数字字符串', () => {
    expect(
      commentSchema.parse({ content: '回复', parentId: '8', replyToUserId: null }),
    ).toEqual({ content: '回复', parentId: 8, replyToUserId: null });
    expect(commentSchema.safeParse({ content: 'x', parentId: 0 }).success).toBe(false);
  });
});

describe('分页类 schema', () => {
  it('推荐流提供默认分页，单页上限 36', () => {
    expect(feedQuerySchema.parse({})).toEqual({ page: 1, pageSize: 24 });
    expect(feedQuerySchema.safeParse({ pageSize: 36 }).success).toBe(true);
    expect(feedQuerySchema.safeParse({ pageSize: 37 }).success).toBe(false);
  });

  it('作者详情与通用分页保持可选', () => {
    expect(authorDetailSchema.parse({})).toEqual({});
    expect(pageQuerySchema.parse({ page: '3' })).toEqual({ page: 3 });
    expect(authorDetailSchema.safeParse({ pageSize: 37 }).success).toBe(false);
  });

  it('作者关键词最多 32 字', () => {
    expect(authorListSchema.parse({ keyword: ' 小希 ' }).keyword).toBe('小希');
    expect(authorListSchema.safeParse({ keyword: 'x'.repeat(33) }).success).toBe(false);
  });
});

describe('账号类 schema', () => {
  it('邮箱去空格并校验格式', () => {
    expect(emailSchema.parse('  demo@sylvie.cc ')).toBe('demo@sylvie.cc');
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
    expect(emailSchema.safeParse(`${'a'.repeat(120)}@sylvie.cc`).success).toBe(false);
  });

  it('发送验证码默认场景为注册', () => {
    expect(sendCodeSchema.parse({ email: 'demo@sylvie.cc' })).toEqual({
      email: 'demo@sylvie.cc',
      scene: 'register',
    });
    expect(
      sendCodeSchema.safeParse({ email: 'demo@sylvie.cc', scene: 'other' }).success,
    ).toBe(false);
  });

  it('注册要求昵称、合法邮箱、6-64 位密码与 4-8 位验证码', () => {
    const valid = {
      nickname: ' 小希 ',
      email: 'demo@sylvie.cc',
      password: '123456',
      code: '123456',
    };
    expect(registerSchema.parse(valid)).toMatchObject({ nickname: '小希' });

    expect(registerSchema.safeParse({ ...valid, nickname: '  ' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: '12345' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: 'x'.repeat(65) }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, code: '123' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, code: '123456789' }).success).toBe(false);
  });

  it('登录只要求非空密码', () => {
    expect(loginSchema.safeParse({ email: 'demo@sylvie.cc', password: '1' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'demo@sylvie.cc', password: '' }).success).toBe(false);
  });

  it('资料更新限制头像类型与序号', () => {
    expect(profileSchema.parse({ avatarType: '1', avatarIndex: '7' })).toEqual({
      avatarType: 1,
      avatarIndex: 7,
    });
    expect(profileSchema.safeParse({ avatarType: 2 }).success).toBe(false);
    expect(profileSchema.safeParse({ avatarIndex: 8 }).success).toBe(false);
    expect(profileSchema.safeParse({ nickname: '' }).success).toBe(false);
  });
});

describe('杂项 schema', () => {
  it('公告分页上限 48', () => {
    expect(announcementListSchema.safeParse({ pageSize: 48 }).success).toBe(true);
    expect(announcementListSchema.safeParse({ pageSize: 49 }).success).toBe(false);
  });

  it('通知筛选只接受 all / unread', () => {
    expect(notificationQuerySchema.safeParse({ filter: 'unread' }).success).toBe(true);
    expect(notificationQuerySchema.safeParse({ filter: 'read' }).success).toBe(false);
  });

  it('会员套餐编号必填', () => {
    expect(createVipSchema.safeParse({ planCode: 'monthly' }).success).toBe(true);
    expect(createVipSchema.safeParse({ planCode: '  ' }).success).toBe(false);
  });

  it('我的购买分页上限 24', () => {
    expect(purchasesQuerySchema.parse({ ordersPage: '2', unlocksPage: '1' })).toEqual({
      ordersPage: 2,
      unlocksPage: 1,
    });
    expect(purchasesQuerySchema.safeParse({ pageSize: 25 }).success).toBe(false);
  });
});
