# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository scope

Design/documentation-only repository for v1 of 「希尔薇图集」, a dark-themed photo-gallery site. There is no application source, package manifest, build, lint, or test tooling. Do not invent npm/build/test commands. All deliverables are in `docs/` and written in Chinese; keep the `美女写真网站-v1` filename prefix.

## Source-of-truth map

| File | Role |
|---|---|
| `docs/美女写真网站-v1功能清单.md` | Front-end behavior spec, organized by page. YAML frontmatter configures a markmap mind-map view. |
| `docs/美女写真网站-v1原型设计.html` | Front-end interactive prototype: one self-contained HTML file (inline CSS/JS, demo data, state persisted in `localStorage`). Open directly in a browser. |
| `docs/美女写真网站-v1数据库设计.sql` | MySQL 8 schema: 24 tables, conventions at the top, seed data at the bottom. |
| `docs/美女写真网站-v1管理后台功能清单.md` | Admin console spec. Separate app, desktop-only (≥1280px), shares only the database with the front end. |
| `docs/美女写真网站-v1管理后台原型.html` | Admin console prototype, same single-file approach; independent login layer. |

Cross-file consistency is the main maintenance task: when changing a rule or field, update the SQL (schema, comments, seed data), the relevant feature list, and both prototypes when the behavior is user-visible.

## Cross-cutting domain rules

- **Roles**: `guest` (not persisted) / `member` / `vip` / `admin`. Only `admin` can publish albums; members and VIPs have no upload/publish rights.
- **Album access**: guests and members see only the first 3 images until unlocked. A member permanently unlocks one album with `album.points`; unlock grants full viewing and repeatable downloads. VIP views and downloads every album without spending points.
- **Points**: termed 「解锁积分」 in the UI. Earned by daily check-in (`sys_config.checkin.points`, default 2), spent only at unlock time — never at download time. `user.points` must never go negative.
- **Watermark**: only the locked first-3 previews use `album_image.watermark_url`; after unlock and for VIP, always serve the original `url`. The global `sys_config.image.watermark_on` switch only affects locked previews.
- **Publishing**: `album.status` is `draft` / `published` / `offline`; `published_at` drives “latest” sorting. `is_recommended` feeds the waterfall recommendation pool.
- **Payments**: v1 supports Alipay only. Admin-gifted membership is a 0-yuan `pay_order` with `pay_type='admin'`. Renewal stacks 30 days onto the remaining `user.vip_expire_at`.
- **Soft delete**: prefer `is_deleted` / `status` over physical deletes. Denormalized counters (`album.view_count` / `fav_count` / `download_count` / `comment_count`, `author.album_count`, `tag.use_count`) must be updated by the same operation that changes the underlying rows.

## Database conventions

MySQL 8 / InnoDB / `utf8mb4_unicode_ci`; `BIGINT UNSIGNED AUTO_INCREMENT` primary keys; `DATETIME` timestamps (application stores Beijing time); soft delete preferred; counters denormalized for list-page reads. See the header comment of the SQL file before editing.

## Prototype conventions

- Both prototypes are standalone HTML: open in a browser, no install/build/watch step.
- Prototype state is hardcoded demo data plus `localStorage`; nothing persists to a backend.
- Front-end prototype is responsive (PC/H5); admin prototype is desktop-only.
- Shared visual language: dark background, rose-red accent `#ff2d55`, gradient square logo with 「希」.

## Git workflow

Commit directly on `main`; do not create a feature branch. Keep commit messages in Chinese with a `docs:` prefix.
