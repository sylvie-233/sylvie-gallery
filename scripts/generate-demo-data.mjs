#!/usr/bin/env node
// 生成 scripts/init/02-demo-data.sql
// 数据来源：docs/美女写真网站-v1原型设计.html 中的演示数据。
// 运行前需先在本仓库执行 pnpm install（用于 bcryptjs 生成密码哈希）。

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const bcrypt = require(resolve(repoRoot, 'gallery-monorepo/apps/api/node_modules/bcryptjs'));

const PASSWORD_HASH = bcrypt.hashSync('123456', 10);
const VIDEO_URL = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

const q = (value) => {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
};
const num = (value) => Number(value).toFixed(0);

// 作者顺序与 docs/美女写真网站-v1数据库设计.sql 的基础种子一致（id 1-7）
const AUTHORS = [
  { id: 1, name: '铃木美咲' },
  { id: 2, name: '白露' },
  { id: 3, name: '南栀' },
  { id: 4, name: '桃夭' },
  { id: 5, name: '青芷' },
  { id: 6, name: '素荷' },
  { id: 7, name: '林熙' },
];

const RAW = [
  ['2026.11.17 绝对主观美少女Vol.6', 0, ['黑丝', '内衣', '日系'], 37, 1, '2026-11-17'],
  ['2026.11.14 白裙与午后的窗', 1, ['白裙', '日系', '清新'], 26, 0, '2026-11-14'],
  ['2026.11.12 冬夜暖光 · 居家私影', 2, ['居家', '内衣', '暖光'], 31, 1, '2026-11-12'],
  ['2026.11.09 银座街头 · 都市夜景', 0, ['街拍', '夜景', '都市'], 24, 0, '2026-11-09'],
  ['2026.11.05 猫耳女仆的下午茶', 3, ['女仆', '洛丽塔', '可爱'], 33, 1, '2026-11-05'],
  ['2026.11.01 海边的泳装记忆', 1, ['泳装', '海边', '夏日'], 28, 2, '2026-11-01'],
  ['2026.10.28 汉服 · 月上柳梢', 4, ['古风', '汉服', '国风'], 40, 0, '2026-10-28'],
  ['2026.10.25 教室后排的秘密', 2, ['JK', '校园', '制服'], 22, 0, '2026-10-25'],
  ['2026.10.21 现役JK的美脚连裤袜', 0, ['JK', '白丝', '制服'], 29, 0, '2026-10-21'],
  ['2026.10.18 黑色蕾丝的诱惑', 3, ['黑丝', '内衣', '蕾丝'], 36, 1, '2026-10-18'],
  ['2026.10.15 浮世花罗蝶（上卷）', 0, ['和风', '浴衣', '日系'], 35, 0, '2026-10-15'],
  ['2026.10.11 秋日红叶和服', 0, ['和风', '和服', '秋日'], 30, 0, '2026-10-11'],
  ['2026.10.05 白丝与过膝袜图鉴', 1, ['白丝', '制服', '图鉴'], 34, 0, '2026-10-05'],
  ['2026.09.30 天台上的夏末', 2, ['日系', '清新', '校园'], 25, 0, '2026-09-30'],
  ['2026.09.25 洛丽塔茶会', 3, ['洛丽塔', '茶会', '可爱'], 32, 1, '2026-09-25'],
  ['2026.09.18 旗袍 · 旧上海', 4, ['国风', '旗袍', '复古'], 39, 0, '2026-09-18'],
  ['2026.09.12 健身房私教时间', 2, ['运动', '内衣', '健身'], 27, 1, '2026-09-12'],
  ['2026.09.06 雨天的透明伞', 1, ['日系', '街拍', '雨天'], 23, 0, '2026-09-06'],
  ['2026.09.01 双马尾与百褶裙', 3, ['JK', '制服', '双马尾'], 29, 0, '2026-09-01'],
  ['2026.08.25 温泉旅馆的一夜', 0, ['和风', '浴衣', '温泉'], 35, 1, '2026-08-25'],
  ['2026.08.19 夏日祭典 · 浴衣回', 4, ['和风', '浴衣', '祭典'], 31, 0, '2026-08-19'],
  ['2026.08.14 游龙清影 · 西施', 4, ['古风', '国风', 'cos'], 38, 2, '2026-08-14'],
  ['2026.08.09 白裙与海边公路', 1, ['白裙', '旅拍', '清新'], 26, 0, '2026-08-09'],
  ['2026.08.03 深夜便利店的她', 2, ['街拍', '夜景', '便利店'], 21, 0, '2026-08-03'],
  ['2026.07.28 蕾丝睡衣的清晨', 3, ['内衣', '居家', '蕾丝'], 33, 2, '2026-07-28'],
  ['2026.07.22 剑道少女', 4, ['制服', '运动', '和风'], 28, 0, '2026-07-22'],
  ['2026.07.16 樱花与制服', 0, ['日系', '樱花', '制服'], 36, 1, '2026-07-16'],
  ['2026.07.10 摄影棚 · 黑白情绪', 1, ['艺术', '黑白', '情绪'], 24, 0, '2026-07-10'],
  ['2026.07.04 猫系少女的午后', 3, ['日系', '猫系', '居家'], 30, 0, '2026-07-04'],
  ['2026.06.28 美人女教师想和我谈恋爱', 0, ['JK', '制服', '剧情'], 42, 1, '2026-06-28'],
  ['2026.11.16 海边日落泳装', 6, ['泳装', '海边', '夏日'], 33, 2, '2026-11-16'],
  ['2026.11.10 图书馆的午后', 5, ['校园', '日系', '制服'], 28, 0, '2026-11-10'],
  ['2026.10.30 泳池边的午后', 6, ['泳装', '夏日', '清新'], 27, 1, '2026-10-30'],
  ['2026.10.19 白衬衫与百褶裙', 5, ['JK', '制服', '校园'], 31, 1, '2026-10-19'],
  ['2026.09.28 秋日银杏小径', 5, ['秋日', '日系', '街拍'], 25, 0, '2026-09-28'],
  ['2026.09.20 山间溪谷旅拍', 6, ['户外', '旅拍', '清新'], 24, 0, '2026-09-20'],
  ['2026.09.08 教室窗边的她', 5, ['校园', '日系', '制服'], 29, 0, '2026-09-08'],
];

const ANNOUNCEMENTS = [
  ['rule', 1, '关于图集发布与内容审核的说明', '2026-11-17', '全站图集仅由管理员统一发布与审核，注册用户与会员均不提供上传入口。', [
    '为保障内容质量与合规性，希尔薇图集所有图集均由管理员统一编排、发布与上架，站点不开放用户上传或发布入口。',
    '作者如需合作投稿，请通过「联系我们」提交作品集与身份信息，审核通过后由管理员代为发布，并在图集页标注作者信息。',
    '所有图片均经过人工复核后展示，违规内容一律不予上架。',
  ]],
  ['update', 0, '11 月第三批图集已更新（6 套 / 189 张）', '2026-11-16', '铃木美咲、白露、南栀三位作者的新图已上架，付费会员可打包下载原图。', [
    '本次共更新 6 套图集，合计 189 张图片与 3 段视频。',
    '付费会员可直接在详情页右侧点击「解锁 / 下载」获取整包原图；注册会员可用解锁积分兑换单套图集。',
  ]],
  ['activity', 0, '月卡限时 8 折 · 至 11 月 30 日', '2026-11-12', '付费会员月卡活动价 ¥15.2，活动结束后恢复 ¥19。', [
    '活动期间开通付费会员月卡享 8 折优惠，权益与正价一致。',
    '会员按月计费，30 天后到期，可随时手动续费。',
  ]],
  ['maintain', 0, '图片 CDN 节点升级完成', '2026-11-08', '本次升级后图片首屏加载平均提速约 40%，移动端体验改善明显。', [
    '图片分发已切换至新的 CDN 节点，首屏加载速度提升约 40%。',
    '如遇个别图片加载异常，可尝试刷新页面或清理缓存。',
  ]],
  ['rule', 0, '评论区规则：回复需管理员审核后展示', '2026-11-02', '为减少广告与违规内容，评论回复将进入审核队列，通过后对所有人可见。', [
    '发表的一级评论即时展示，他人的回复内容需经管理员审核后展示。',
    '审核通常在 24 小时内完成，违规内容将被删除并记录。',
  ]],
  ['update', 0, '新增「标签云」与「瀑布流」入口', '2026-10-26', '首页导航新增标签与瀑布流，可按标签快速检索，也可无限下滑浏览推荐。', [
    '标签页按收录数量排序，点击任一标签即可进入对应的卡片列表。',
    '瀑布流根据浏览与收藏行为推荐，向下滚动自动加载更多。',
  ]],
  ['update', 0, '瀑布流推荐算法优化，重复率下降', '2026-10-22', '新版推荐会结合最近浏览与收藏，同一作者的作品不会连续出现。', [
    '本次调整后，同一作者、同一标签的作品在首屏内不会重复出现。',
    '已收藏的图集权重下调，避免首页一直推荐同一批内容。',
  ]],
  ['rule', 0, '图集标签规范化说明', '2026-10-17', '标签统一为服饰、场景、风格三类，避免同义词重复建标。', [
    '新增图集请优先复用已有标签，例如「白丝」不再另建「白色丝袜」。',
    '标签由管理员在发布时维护，用户侧不可自行新增。',
  ]],
  ['notice', 0, '关于禁止倒卖站点资源的声明', '2026-10-12', '任何形式的二次售卖、搬运、去水印转售均属违规，将封禁账号并追责。', [
    '站内所有图集版权归作者与站点共有，仅限个人观看使用。',
    '发现倒卖行为可向客服举报，核实后给予积分奖励。',
  ]],
  ['activity', 0, '万圣节主题图集上线', '2026-10-08', '桃夭、青芷的万圣节特别企划已上架，会员可打包下载。', [
    '本次共 3 套主题图集，包含哥特、女巫与南瓜灯三组造型。',
    '活动期间付费会员下载不限速。',
  ]],
  ['maintain', 0, '支付通道维护通知（10/05 02:00-04:00）', '2026-10-03', '维护期间支付宝下单可能失败，结束后自动恢复。', [
    '维护窗口为 10 月 5 日 02:00 至 04:00，期间下单可能失败。',
    '维护结束后未支付的订单会自动取消，可重新下单。',
  ]],
  ['rule', 0, '作者入驻与投稿说明', '2026-09-28', '站点不开放用户上传，作者合作统一走管理员代为发布。', [
    '有意合作的作者请通过「联系我们」提交作品集与身份信息。',
    '审核通过后由管理员代为编排、发布，并在作者页展示简介与别名。',
  ]],
  ['update', 0, '移动端体验优化：图片加载与手势', '2026-09-22', '详情页支持双击缩放与左右滑动切图，弱网下优先加载预览图。', [
    '移动端详情页新增双击放大、双指缩放与滑动切换。',
    '弱网环境先加载低清预览，滚动到位后再替换为高清图。',
  ]],
  ['activity', 0, '国庆活动：月卡 7 折', '2026-09-26', '9 月 28 日至 10 月 8 日，付费会员月卡 ¥13.3。', [
    '活动价仅限月卡，一次性开通一个月。',
    '活动期间开通的会员，权益与正价一致。',
  ]],
  ['rule', 0, '评论区规范更新', '2026-09-15', '新增禁止发布联系方式、引流链接等条款，违规将禁言 7 天起。', [
    '评论区禁止发布任何联系方式、群号与外链。',
    '首次违规禁言 7 天，累计三次永久关闭评论权限。',
  ]],
  ['update', 0, '新增「订阅作者」功能', '2026-09-10', '在作者页点订阅，该作者有新图时会收到站内通知。', [
    '订阅后可在「我的通知」中查看作者更新提醒。',
    '订阅不占用收藏额度，可随时取消。',
  ]],
  ['notice', 0, '站点域名与备案信息更新', '2026-09-04', '站点已切换至新域名，旧域名将保留 301 跳转 90 天。', [
    '请更新浏览器书签，旧链接会自动跳转到新域名。',
    '备案信息已在页脚更新，如有疑问可联系客服。',
  ]],
  ['rule', 0, '压缩包下载失败的排查指引', '2026-08-30', '下载中断多为网络波动或浏览器拦截，可按以下步骤排查。', [
    '先确认剩余磁盘空间不小于压缩包体积的两倍。',
    '若浏览器提示「不安全下载」，请在下载栏选择保留。',
    '仍然失败可更换浏览器或使用手机热点重试。',
  ]],
];

const ALBUMS = RAW.map((row, index) => {
  const [title, authorIndex, tags, imageCount, videoCount, date] = row;
  const author = AUTHORS[authorIndex];
  const id = 1000 + index;
  const description = `${author.name}的个人写真企划，本套以「${tags[0]}」为主题，收录 ${imageCount} 张图片${videoCount ? `与 ${videoCount} 段视频` : ''}。全程自然光拍摄，保留原始肤色与质感，包含特写、半身与全身构图，部分为未公开花絮。`;
  return {
    id,
    title,
    authorId: author.id,
    tags,
    imageCount,
    videoCount,
    date,
    points: index % 4 === 0 ? 2 : 1,
    views: 1260 + ((index * 911) % 4980),
    favs: 168 + ((index * 263) % 1520),
    size: Number((300 + ((index * 97) % 620) + ((index * 37) % 80) / 100).toFixed(2)),
    recommended: index % 3 === 0 ? 1 : 0,
    description,
    status: 'published',
    createdAt: `${date} 09:00:00`,
    publishedAt: `${date} 10:00:00`,
  };
});

// 后台演示用的草稿 / 已下架图集：不计入前台与标签收录数
ALBUMS.push(
  {
    id: 1037,
    title: '【草稿】2026.11.19 冬日暖阳预告',
    authorId: 2,
    tags: ['暖光', '居家', '日系'],
    imageCount: 8,
    videoCount: 0,
    date: '2026-11-18',
    points: 1,
    views: 0,
    favs: 0,
    size: 86.4,
    recommended: 0,
    description: '白露的冬日室内企划草稿，待补充外景与成片后发布。',
    status: 'draft',
    createdAt: '2026-11-18 09:00:00',
    publishedAt: null,
  },
  {
    id: 1038,
    title: '2026.10.01 旧作 · 已下架',
    authorId: 4,
    tags: ['JK', '校园', '制服'],
    imageCount: 12,
    videoCount: 1,
    date: '2026-10-01',
    points: 1,
    views: 860,
    favs: 64,
    size: 142.8,
    recommended: 0,
    description: '桃夭早期校园企划，因素材版权原因暂时下架。',
    status: 'offline',
    createdAt: '2026-10-01 09:00:00',
    publishedAt: '2026-10-01 10:00:00',
  },
  {
    id: 1039,
    title: '2026.09.15 旧作 · 已下架',
    authorId: 6,
    tags: ['清新', '室内'],
    imageCount: 15,
    videoCount: 0,
    date: '2026-09-15',
    points: 1,
    views: 540,
    favs: 31,
    size: 168.2,
    recommended: 0,
    description: '素荷的室内极简旧作，已从公开列表下架但保留记录。',
    status: 'offline',
    createdAt: '2026-09-15 09:00:00',
    publishedAt: '2026-09-15 10:00:00',
  },
);

const lines = [];
lines.push('-- =====================================================================');
lines.push('-- 希尔薇图集 · v1 演示数据（在数据库设计 SQL 之后执行）');
lines.push('-- 由 scripts/generate-demo-data.mjs 生成，请勿手工编辑。');
lines.push('--');
lines.push('-- 演示账号（密码均为 123456）：');
lines.push('--   admin@sylvie.cc  管理员');
lines.push('--   demo@sylvie.cc   注册会员（积分 8，已解锁 1 套）');
lines.push('--   vip@sylvie.cc    付费会员（到期 2027-06-01）');
lines.push('-- =====================================================================');
lines.push('');
lines.push('SET NAMES utf8mb4;');
lines.push('USE `sylvie_gallery`;');
lines.push('');
lines.push('-- 1. 重置管理员演示密码');
lines.push(`UPDATE \`user\` SET password_hash = ${q(PASSWORD_HASH)} WHERE email = 'admin@sylvie.cc';`);
lines.push('');
lines.push('-- 2. 演示用户');
lines.push('INSERT INTO `user` (`id`,`email`,`password_hash`,`nickname`,`avatar_type`,`avatar_index`,`role`,`points`,`vip_expire_at`,`status`,`email_verified`,`is_deleted`) VALUES');
lines.push(
  [
    `(2,'demo@sylvie.cc',${q(PASSWORD_HASH)},'小希',0,1,'member',8,NULL,1,1,0)`,
    `(3,'vip@sylvie.cc',${q(PASSWORD_HASH)},'夜航',0,6,'vip',3,'2027-06-01 00:00:00',1,1,0)`,
    `(4,'lulu@sylvie.cc',${q(PASSWORD_HASH)},'小鹿',0,3,'member',4,NULL,1,1,0)`,
    `(5,'ache@sylvie.cc',${q(PASSWORD_HASH)},'阿澈',0,4,'vip',12,'2026-12-31 00:00:00',1,1,0)`,
    `(6,'yehang@sylvie.cc',${q(PASSWORD_HASH)},'拾光',0,5,'member',6,NULL,1,1,0)`,
  ].join(',\n') + ';',
);
lines.push('');
lines.push('-- 3. 作者封面');
for (const author of AUTHORS) {
  lines.push(
    `UPDATE \`author\` SET cover_url = 'https://picsum.photos/seed/sylvie-author-${author.id}/400/400' WHERE id = ${author.id};`,
  );
}
lines.push('');

lines.push('-- 4. 标签（补充演示图集使用的新标签，已存在则忽略）');
const existingTags = new Set([
  '日系', '胶片', '清新', '私房', '街拍', '都市', '甜美', '少女',
  '国风', '汉服', '黑白', '极简', '旅拍', '外景', '室内', '人像',
]);
const extraTags = [...new Set(ALBUMS.flatMap((album) => album.tags))].filter(
  (tag) => !existingTags.has(tag),
);
lines.push('INSERT INTO `tag` (`name`,`use_count`,`status`) VALUES');
lines.push(extraTags.map((tag) => `(${q(tag)},0,1)`).join(',\n') + ' ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);');
lines.push('');

lines.push('-- 5. 图集');
lines.push('INSERT INTO `album` (`id`,`author_id`,`title`,`description`,`cover_url`,`image_count`,`video_count`,`package_size`,`points`,`view_count`,`download_count`,`fav_count`,`comment_count`,`is_recommended`,`status`,`published_at`,`created_by`,`is_deleted`,`created_at`,`updated_at`) VALUES');
lines.push(
  ALBUMS.map((album) => {
    const cover = `https://picsum.photos/seed/sylvie-${album.id}-1/600/800`;
    return `(${album.id},${album.authorId},${q(album.title)},${q(album.description)},${q(cover)},${album.imageCount},${album.videoCount},${album.size},${album.points},${album.views},0,${album.favs},0,${album.recommended},${q(album.status)},${album.publishedAt ? q(album.publishedAt) : 'NULL'},1,0,${q(album.createdAt)},${q(album.createdAt)})`;
  }).join(',\n') + ';',
);
lines.push('');

lines.push('-- 6. 图集图片与视频');
const images = [];
for (const album of ALBUMS) {
  for (let i = 1; i <= album.imageCount; i += 1) {
    const url = `https://picsum.photos/seed/sylvie-${album.id}-${i}/800/1067`;
    const thumb = `https://picsum.photos/seed/sylvie-${album.id}-${i}/400/533`;
    const watermark = `https://picsum.photos/seed/sylvie-${album.id}-${i}/800/1067?blur=2`;
    images.push(
      `(${album.id},'image',${q(url)},${q(thumb)},${q(watermark)},800,1067,NULL,${i},0,${q(album.createdAt)})`,
    );
  }
  for (let i = 1; i <= album.videoCount; i += 1) {
    const poster = `https://picsum.photos/seed/sylvie-${album.id}-v${i}/1280/720`;
    images.push(
      `(${album.id},'video',${q(VIDEO_URL)},${q(poster)},NULL,1280,720,30,${i},0,${q(album.createdAt)})`,
    );
  }
}
for (let start = 0; start < images.length; start += 120) {
  lines.push('INSERT INTO `album_image` (`album_id`,`media_type`,`url`,`thumb_url`,`watermark_url`,`width`,`height`,`duration`,`sort_order`,`is_deleted`,`created_at`) VALUES');
  lines.push(images.slice(start, start + 120).join(',\n') + ';');
}
lines.push('');

lines.push('-- 7. 图集-标签关联');
const albumTags = [];
for (const album of ALBUMS) {
  for (const tag of album.tags) {
    albumTags.push(`(${album.id}, (SELECT id FROM \`tag\` WHERE name = ${q(tag)} LIMIT 1))`);
  }
}
lines.push('INSERT INTO `album_tag` (`album_id`,`tag_id`) VALUES');
lines.push(albumTags.join(',\n') + ';');
lines.push('');

lines.push('-- 8. 公告');
lines.push('INSERT INTO `announcement` (`type`,`title`,`summary`,`content`,`is_top`,`status`,`published_at`,`created_by`,`is_deleted`,`created_at`,`updated_at`) VALUES');
lines.push(
  ANNOUNCEMENTS.map(
    ([type, isTop, title, date, summary, body]) =>
      `('${type}',${q(title)},${q(summary)},${q(body.join('\n\n'))},${isTop},1,${q(`${date} 09:00:00`)},1,0,${q(`${date} 09:00:00`)},${q(`${date} 09:00:00`)})`,
  ).join(',\n') + ';',
);
lines.push('');

lines.push('-- 9. 收藏 / 订阅 / 解锁 / 订单');
lines.push('INSERT INTO `favorite` (`user_id`,`album_id`,`created_at`) VALUES');
lines.push(
  [
    [2, 1000], [2, 1001], [2, 1002], [2, 1005], [2, 1008],
    [3, 1000], [3, 1001], [4, 1000], [5, 1001], [6, 1002],
  ]
    .map(([userId, albumId]) => `(${userId},${albumId},'2026-11-16 20:00:00')`)
    .join(',\n') + ';',
);
lines.push('');
lines.push('INSERT INTO `subscription` (`user_id`,`author_id`,`created_at`) VALUES');
lines.push(
  [
    [2, 1], [2, 2], [3, 1], [4, 4], [5, 5],
  ]
    .map(([userId, authorId]) => `(${userId},${authorId},'2026-11-10 12:00:00')`)
    .join(',\n') + ';',
);
lines.push('');
lines.push('INSERT INTO `pay_order` (`id`,`order_no`,`user_id`,`biz_type`,`plan_id`,`album_id`,`pay_type`,`amount_cents`,`points_cost`,`vip_days`,`status`,`trade_no`,`paid_at`,`refund_at`,`refund_reason`,`created_at`,`updated_at`) VALUES');
lines.push(
  [
    `(1,'SV202611150001',2,'unlock',NULL,1000,'points',0,2,0,'paid',NULL,'2026-11-15 10:00:00',NULL,NULL,'2026-11-15 10:00:00','2026-11-15 10:00:00')`,
    `(2,'SV202611010001',3,'vip',1,NULL,'alipay',1900,0,30,'paid','2026110122001400001','2026-11-01 09:00:00',NULL,NULL,'2026-11-01 08:58:00','2026-11-01 09:00:00')`,
    `(3,'SV202611160001',3,'unlock',NULL,1002,'points',0,1,0,'paid',NULL,'2026-11-16 21:30:00',NULL,NULL,'2026-11-16 21:30:00','2026-11-16 21:30:00')`,
    `(4,'SV202606150001',5,'vip',1,NULL,'alipay',1900,0,30,'paid','2026061522001400011','2026-06-15 10:00:00',NULL,NULL,'2026-06-15 09:58:00','2026-06-15 10:00:00')`,
    `(5,'SV202607200001',3,'vip',1,NULL,'alipay',1900,0,30,'paid','2026072022001400012','2026-07-20 11:00:00',NULL,NULL,'2026-07-20 10:58:00','2026-07-20 11:00:00')`,
    `(6,'SV202608110001',5,'vip',1,NULL,'alipay',1900,0,30,'paid','2026081122001400013','2026-08-11 15:30:00',NULL,NULL,'2026-08-11 15:28:00','2026-08-11 15:30:00')`,
    `(7,'SV202609050001',3,'vip',1,NULL,'alipay',1900,0,30,'paid','2026090522001400014','2026-09-05 09:10:00',NULL,NULL,'2026-09-05 09:08:00','2026-09-05 09:10:00')`,
    `(8,'SV202610080001',5,'vip',1,NULL,'alipay',1900,0,30,'paid','2026100822001400015','2026-10-08 20:00:00',NULL,NULL,'2026-10-08 19:58:00','2026-10-08 20:00:00')`,
    `(9,'SV202610250001',3,'vip',1,NULL,'alipay',1900,0,30,'paid','2026102522001400016','2026-10-25 12:00:00',NULL,NULL,'2026-10-25 11:58:00','2026-10-25 12:00:00')`,
    `(10,'SV202611020001',5,'vip',1,NULL,'alipay',1900,0,30,'paid','2026110222001400017','2026-11-02 08:00:00',NULL,NULL,'2026-11-02 07:58:00','2026-11-02 08:00:00')`,
    `(11,'SV202611150002',3,'vip',1,NULL,'alipay',1900,0,30,'paid','2026111522001400018','2026-11-15 21:00:00',NULL,NULL,'2026-11-15 20:58:00','2026-11-15 21:00:00')`,
    `(12,'SV202611180001',5,'vip',1,NULL,'alipay',1900,0,30,'paid','2026111822001400019',CONCAT(CURDATE(), ' 09:20:00'),NULL,NULL,CONCAT(CURDATE(), ' 09:18:00'),CONCAT(CURDATE(), ' 09:20:00'))`,
    `(13,'SV202610200001',4,'vip',1,NULL,'alipay',1900,0,30,'refunded','2026102022001400020','2026-10-20 14:00:00','2026-10-21 10:00:00','重复购买，协商退款','2026-10-20 13:58:00','2026-10-21 10:00:00')`,
    `(14,'SV202611180002',4,'vip',1,NULL,'alipay',1900,0,30,'created',NULL,NULL,NULL,NULL,CONCAT(CURDATE(), ' 11:30:00'),CONCAT(CURDATE(), ' 11:30:00'))`,
    `(15,'SV202611180003',4,'unlock',NULL,1005,'points',0,1,0,'paid',NULL,CONCAT(CURDATE(), ' 10:10:00'),NULL,NULL,CONCAT(CURDATE(), ' 10:10:00'),CONCAT(CURDATE(), ' 10:10:00'))`,
  ].join(',\n') + ';',
);
lines.push('');
lines.push('INSERT INTO `album_unlock` (`user_id`,`album_id`,`order_id`,`points_cost`,`created_at`) VALUES');
lines.push(
  `(2,1000,1,2,'2026-11-15 10:00:00'),\n(3,1002,3,1,'2026-11-16 21:30:00'),\n(4,1005,15,1,CONCAT(CURDATE(), ' 10:10:00'));`,
);
lines.push('');

lines.push('-- 10. 评论（demo 用户有一条待审核评论）');
lines.push('INSERT INTO `comment` (`id`,`album_id`,`user_id`,`parent_id`,`reply_to_user_id`,`content`,`status`,`is_deleted`,`created_at`,`updated_at`) VALUES');
lines.push(
  [
    `(1,1000,4,NULL,NULL,'这套的光线和肤色处理太舒服了，第三张的窗边构图很喜欢。','approved',0,'2026-11-17 12:30:00','2026-11-17 12:30:00')`,
    `(2,1000,5,1,4,'同感，胶片颗粒感保留得刚刚好。','approved',0,'2026-11-17 13:10:00','2026-11-17 13:10:00')`,
    `(3,1000,2,1,4,'请问花絮部分也会一起打包吗？','pending',0,'2026-11-17 18:20:00','2026-11-17 18:20:00')`,
    `(4,1001,5,NULL,NULL,'白裙和午后窗光的组合永远不会出错，已收藏。','approved',0,'2026-11-15 09:00:00','2026-11-15 09:00:00')`,
    `(5,1001,4,4,5,'第二套的外景也很棒，期待下个月更新。','approved',0,'2026-11-15 11:00:00','2026-11-15 11:00:00')`,
    `(6,1002,6,NULL,NULL,'冬夜暖光的色调很有电影感，感谢分享。','approved',0,'2026-11-13 20:30:00','2026-11-13 20:30:00')`,
    `(7,1003,2,NULL,NULL,'银座夜景那几张的霓虹反射很有氛围。','approved',0,'2026-11-10 22:00:00','2026-11-10 22:00:00')`,
    `(8,1005,6,NULL,NULL,'海边的色彩很干净，视频片段也很加分。','approved',0,'2026-11-02 18:00:00','2026-11-02 18:00:00')`,
    `(9,1003,3,NULL,NULL,'请问这套还有未公开的花絮吗？','pending',0,'2026-11-18 09:12:00','2026-11-18 09:12:00')`,
    `(10,1004,4,NULL,NULL,'女仆这套的道具可以分享购买链接吗？','pending',0,'2026-11-18 10:05:00','2026-11-18 10:05:00')`,
    `(11,1006,5,NULL,NULL,'泳装那套的拍摄地点是哪片海滩？','pending',0,'2026-11-18 10:40:00','2026-11-18 10:40:00')`,
    `(12,1002,6,NULL,NULL,'希望后续能出同主题的视频合集。','pending',0,'2026-11-18 11:15:00','2026-11-18 11:15:00')`,
    `(13,1000,6,2,5,'花絮部分会在压缩包里一起提供。','pending',0,'2026-11-18 11:40:00','2026-11-18 11:40:00')`,
    `(14,1007,4,NULL,NULL,'加我微信 xxx 看更多。','rejected',0,'2026-11-16 14:00:00','2026-11-16 14:00:00')`,
  ].join(',\n') + ';',
);
lines.push('');

lines.push('-- 11. 站内通知（demo 用户）');
lines.push('INSERT INTO `user_notification` (`user_id`,`type`,`title`,`content`,`album_id`,`is_read`,`read_at`,`created_at`) VALUES');
lines.push(
  [
    `(2,'update','铃木美咲 发布了新图集','2026.11.17 绝对主观美少女Vol.6 已上架，共 37 张图片 / 1 个视频',1000,0,NULL,'2026-11-17 11:00:00')`,
    `(2,'review','你的评论已提交审核','在《2026.11.17 绝对主观美少女Vol.6》下的评论等待管理员审核',1000,0,NULL,'2026-11-17 18:20:00')`,
    `(2,'benefit','付费会员即将到期','你的付费会员将在 30 天后到期，到期前续费可连续享受权益',NULL,0,NULL,'2026-11-17 08:00:00')`,
    `(2,'update','白露 发布了新图集','2026.11.14 白裙与午后的窗 已上架，共 26 张图片',1001,1,'2026-11-15 12:00:00','2026-11-14 10:00:00')`,
    `(2,'benefit','付费会员权益更新','新增「新图提前 3 天抢先看」，你当前已可使用',NULL,1,'2026-11-14 12:00:00','2026-11-13 10:00:00')`,
    `(2,'system','图片节点升级完成','图片 CDN 节点升级完成，首屏加载平均提速约 40%',NULL,1,'2026-11-09 12:00:00','2026-11-08 10:00:00')`,
    `(2,'system','新设备登录提醒','检测到你在新设备登录，如非本人操作请及时修改密码',NULL,1,'2026-11-06 12:00:00','2026-11-06 10:00:00')`,
  ].join(',\n') + ';',
);
lines.push('');

lines.push('-- 12. 搜索热词（近 7 天）');
const HOT_SEARCHES = [
  ['日系', 7, 12],
  ['白丝', 6, 8],
  ['泳装', 5, 5],
  ['汉服', 4, 6],
  ['街拍', 3, 9],
  ['制服', 2, 4],
  ['私房', 2, 3],
  ['旅拍', 1, 7],
];
const searchRows = [];
for (const [keyword, days, resultCount] of HOT_SEARCHES) {
  for (let day = 0; day < days; day += 1) {
    searchRows.push(
      `('album',${q(keyword)},NULL,${resultCount},DATE_SUB(CURDATE(), INTERVAL ${day} DAY),NOW())`,
    );
  }
}
lines.push('INSERT INTO `search_log` (`scene`,`keyword`,`user_id`,`result_count`,`search_date`,`created_at`) VALUES');
lines.push(searchRows.join(',\n') + ';');
lines.push('');

lines.push('-- 13. 今日浏览记录（PV / UV 演示）');
const viewUsers = [2, 3, 4, 5, 6, null];
const viewRows = [];
for (let index = 0; index < 24; index += 1) {
  const userId = viewUsers[index % viewUsers.length];
  const visitor = userId === null ? `'demo-guest-${index}'` : 'NULL';
  const albumId = 1000 + (index % 37);
  viewRows.push(
    `(${userId ?? 'NULL'},${visitor},${albumId},CURDATE(),'127.0.0.1',NOW())`,
  );
}
lines.push('INSERT INTO `user_view_log` (`user_id`,`visitor_id`,`album_id`,`view_date`,`ip`,`created_at`) VALUES');
lines.push(viewRows.join(',\n') + ';');
lines.push('');

lines.push('-- 14. 同步冗余计数');
lines.push('UPDATE `author` a SET `album_count` = (SELECT COUNT(*) FROM `album` al WHERE al.`author_id` = a.`id` AND al.`status` = \'published\' AND al.`is_deleted` = 0);');
lines.push('UPDATE `author` a SET `last_update_at` = (SELECT MAX(al.`published_at`) FROM `album` al WHERE al.`author_id` = a.`id` AND al.`status` = \'published\' AND al.`is_deleted` = 0);');
lines.push('UPDATE `tag` t SET `use_count` = (SELECT COUNT(*) FROM `album_tag` at JOIN `album` a ON a.`id` = at.`album_id` AND a.`status` = \'published\' AND a.`is_deleted` = 0 WHERE at.`tag_id` = t.`id`);');
lines.push('UPDATE `album` a SET `comment_count` = (SELECT COUNT(*) FROM `comment` c WHERE c.`album_id` = a.`id` AND c.`status` = \'approved\' AND c.`is_deleted` = 0);');
lines.push('');
lines.push('-- 演示数据结束');

const outputDir = resolve(__dirname, 'init');
mkdirSync(outputDir, { recursive: true });
const outputPath = resolve(outputDir, '02-demo-data.sql');
writeFileSync(outputPath, lines.join('\n') + '\n', 'utf8');
console.log(`已生成 ${outputPath}`);
console.log(`图集 ${ALBUMS.length} 套，媒体 ${images.length} 条，公告 ${ANNOUNCEMENTS.length} 条。`);
