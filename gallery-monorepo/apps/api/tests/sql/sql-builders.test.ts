/**
 * SQL 构建层测试：占位符与 LIKE 转义、图集列表筛选 / 排序 / 分页，
 * 以及认证相关语句的参数化约定。所有用户输入必须落在 params 中。
 */
import { describe, expect, it } from 'vitest';

import {
  albumListFilter,
  albumListOrder,
  countAlbums,
  insertComment,
  selectAlbumsPage,
  selectPreviewAlbumImages,
} from '../../src/sql/album.sql.js';
import {
  countRegisteredUserByEmail,
  countUserByEmailForUpdate,
  insertRegisteredUser,
  insertVerifyCode,
  markVerifyCodeUsed,
  selectLatestVerifyCodeForUpdate,
  selectLoginUser,
} from '../../src/sql/auth.sql.js';
import { likePattern, placeholders } from '../../src/sql/shared.js';

describe('placeholders', () => {
  it('按数量生成逗号分隔的问号', () => {
    expect(placeholders(1)).toBe('?');
    expect(placeholders(3)).toBe('?, ?, ?');
  });
});

describe('likePattern', () => {
  it('包裹通配符并转义用户输入中的特殊字符', () => {
    expect(likePattern('album')).toBe('%album%');
    expect(likePattern('50%_off')).toBe('%50\\%\\_off%');
    expect(likePattern('back\\slash')).toBe('%back\\\\slash%');
  });
});

describe('albumListFilter', () => {
  const base = { tagName: '', keyword: '' };

  it('无筛选时只有公开可见条件且无参数', () => {
    const fragment = albumListFilter(base);
    expect(fragment.sql).toContain("a.status = 'published'");
    expect(fragment.sql).toContain('au.is_deleted = 0');
    expect(fragment.params).toEqual([]);
  });

  it('按作者过滤追加 author_id 条件', () => {
    const fragment = albumListFilter({ ...base, authorId: 12 });
    expect(fragment.sql).toContain('a.author_id = ?');
    expect(fragment.params).toContain(12);
  });

  it('按标签名过滤使用 EXISTS，避免 JOIN 重复行', () => {
    const fragment = albumListFilter({ ...base, tagName: '写真' });
    expect(fragment.sql).toContain('EXISTS (SELECT 1 FROM album_tag');
    expect(fragment.params).toContain('写真');
  });

  it('关键词同时匹配标题、作者与标签，重复四次 LIKE', () => {
    const fragment = albumListFilter({ ...base, keyword: '冬日' });
    expect(fragment.sql).toContain('a.title LIKE ?');
    expect(fragment.sql).toContain('au.alias LIKE ?');
    expect(fragment.params.filter((param) => param === '%冬日%')).toHaveLength(4);
  });

  it('组合筛选时参数顺序与条件顺序一致', () => {
    const fragment = albumListFilter({ authorId: 3, tagName: '写真', keyword: '冬' });
    expect(fragment.params.at(-1)).toBe('%冬%');
    expect(fragment.params).toContain(3);
    expect(fragment.params).toContain('写真');
  });

  it('恶意关键词只进入参数，不拼接进 SQL', () => {
    const keyword = "x'; DROP TABLE album; --";
    const fragment = albumListFilter({ ...base, keyword });
    expect(fragment.sql).not.toContain('DROP TABLE');
    expect(fragment.params).toContain(`%${keyword}%`);
  });
});

describe('albumListOrder', () => {
  it('hot / fav 使用对应排序字段，其余按发布时间', () => {
    expect(albumListOrder('hot')).toContain('a.view_count DESC');
    expect(albumListOrder('fav')).toContain('a.fav_count DESC');
    expect(albumListOrder('new')).toContain('a.published_at DESC');
  });

  it('都以 id 倒序兜底，保证分页稳定', () => {
    for (const sort of ['new', 'hot', 'fav'] as const) {
      expect(albumListOrder(sort)).toContain('a.id DESC');
    }
  });
});

describe('countAlbums / selectAlbumsPage', () => {
  const where = albumListFilter({ tagName: '', keyword: '' });

  it('计数语句复用筛选参数', () => {
    const statement = countAlbums(where);
    expect(statement.sql).toContain('SELECT COUNT(*) AS total');
    expect(statement.params).toEqual(where.params);
  });

  it('分页语句在筛选参数后追加 pageSize 与 offset', () => {
    const statement = selectAlbumsPage(where, albumListOrder('new'), 24, 48);
    expect(statement.sql).toContain('ORDER BY a.published_at DESC');
    expect(statement.sql).toContain('LIMIT ? OFFSET ?');
    expect(statement.params.slice(-2)).toEqual([24, 48]);
    expect(statement.params.slice(0, -2)).toEqual(where.params);
  });
});

describe('selectPreviewAlbumImages / insertComment', () => {
  it('预览只取图片并限制数量', () => {
    const statement = selectPreviewAlbumImages(5, 3);
    expect(statement.sql).toContain("media_type = 'image'");
    expect(statement.sql).toContain('LIMIT ?');
    expect(statement.params).toEqual([5, 3]);
  });

  it('新评论固定 pending，参数顺序与列一致', () => {
    const statement = insertComment({
      albumId: 1,
      userId: 2,
      parentId: null,
      replyToUserId: null,
      content: '好看',
    });
    expect(statement.sql).toContain("'pending'");
    expect(statement.params).toEqual([1, 2, null, null, '好看']);
  });
});

describe('认证 SQL', () => {
  it('注册前按邮箱统计，不包含软删除用户', () => {
    const statement = countRegisteredUserByEmail('demo@sylvie.cc');
    expect(statement.sql).toContain('is_deleted = 0');
    expect(statement.params).toEqual(['demo@sylvie.cc']);
  });

  it('验证码写入使用参数化 TTL', () => {
    const statement = insertVerifyCode('demo@sylvie.cc', 'register', '123456', 10);
    expect(statement.sql).toContain('INTERVAL ? MINUTE');
    expect(statement.params).toEqual(['demo@sylvie.cc', 'register', '123456', 10]);
  });

  it('验证码消费与邮箱唯一性检查都加 FOR UPDATE', () => {
    expect(selectLatestVerifyCodeForUpdate('demo@sylvie.cc', 'register').sql).toContain(
      'FOR UPDATE',
    );
    expect(countUserByEmailForUpdate('demo@sylvie.cc').sql).toContain('FOR UPDATE');
  });

  it('标记验证码已使用只按主键更新', () => {
    const statement = markVerifyCodeUsed(9);
    expect(statement.sql).toContain('used_at = NOW()');
    expect(statement.params).toEqual([9]);
  });

  it('注册角色固定为 member 且邮箱已验证', () => {
    const statement = insertRegisteredUser('demo@sylvie.cc', 'hash', '小希');
    expect(statement.sql).toContain("'member'");
    expect(statement.sql).toContain('email_verified');
    expect(statement.params).toEqual(['demo@sylvie.cc', 'hash', '小希']);
  });

  it('登录查询返回哈希与状态字段别名', () => {
    const statement = selectLoginUser('demo@sylvie.cc');
    expect(statement.sql).toContain('password_hash AS passwordHash');
    expect(statement.sql).toContain('is_deleted AS isDeleted');
    expect(statement.sql).toContain('LIMIT 1');
  });
});
