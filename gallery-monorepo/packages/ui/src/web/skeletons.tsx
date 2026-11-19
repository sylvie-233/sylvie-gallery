/**
 * 前台各类加载骨架屏。
 *
 * 骨架尺寸刻意与真实组件对齐（卡片圆角、图片比例、信息行高度），避免数据
 * 到达后布局跳动。全部依赖前台主题的 `skeleton` / `panel` / `wrap` /
 * `masonry` 全局类；`.masonry` 只在前台全局样式中定义，后台无对应类。
 * 这些组件是纯展示的无状态节点，可被 Server Component 直接渲染。
 */
import { cn } from '@sylvie/utils';

const MASONRY_RATIOS = ['3 / 4', '4 / 5', '2 / 3', '5 / 7', '3 / 4', '4 / 5'];

/**
 * 图集卡片骨架：与真实卡片保持同样的圆角、图片比例与信息行高度。
 *
 * `masonry` 模式下发丝流水的图片比例按 `index` 在固定比例表中循环，
 * 让骨架的错落感与真实瀑布流接近；普通网格固定为 3:4。
 *
 * @param masonry 是否匹配瀑布流卡片，默认 `false`
 * @param index 卡片序号，用于选取瀑布流比例
 */
export function AlbumCardSkeleton({
  masonry = false,
  index = 0,
}: {
  masonry?: boolean;
  index?: number;
}) {
  const ratio = MASONRY_RATIOS[index % MASONRY_RATIOS.length] ?? '3 / 4';
  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-panel">
      <div
        className={cn('skeleton w-full rounded-none', !masonry && 'aspect-[3/4]')}
        style={masonry ? { aspectRatio: ratio } : undefined}
      />
      <div className="px-3 pb-3 pt-2.5">
        <div className="skeleton h-3.5 w-11/12" />
        <div className="skeleton mt-1.5 h-3.5 w-2/3" />
        <div className="mt-2.5 flex items-center gap-2">
          <div className="skeleton h-5 w-5 rounded-full" />
          <div className="skeleton h-3 w-20" />
          <div className="skeleton ml-auto h-3 w-10" />
        </div>
      </div>
    </div>
  );
}

/**
 * 图集网格骨架：普通网格或瀑布流容器的占位。
 *
 * @param count 骨架卡片数量，默认 10
 * @param masonry 使用 `.masonry` 容器并渲染瀑布流卡片，默认 `false`
 * @param className 追加到容器的类名，可覆盖默认栅格列数
 */
export function AlbumGridSkeleton({
  count = 10,
  masonry = false,
  className,
}: {
  count?: number;
  masonry?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        masonry
          ? 'masonry'
          : 'grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5',
        className,
      )}
    >
      {Array.from({ length: count }).map((_, index) => (
        <AlbumCardSkeleton key={index} masonry={masonry} index={index} />
      ))}
    </div>
  );
}

/**
 * 作者卡骨架：方形封面 + 图集数徽章 + 名称条。
 *
 * 固定无参数，尺寸与作者卡组件保持一致，供网格批量复用。
 */
export function AuthorCardSkeleton() {
  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-line bg-[#16161a]">
        <div className="skeleton aspect-square w-full rounded-none" />
        <div className="skeleton absolute right-2 top-2 h-5 w-10 rounded-md" />
      </div>
      <div className="skeleton mx-auto mt-2.5 h-3 w-16" />
    </div>
  );
}

/**
 * 作者网格骨架：2/3/4/5/7 列的响应式栅格占位。
 *
 * @param count 骨架数量，默认 7
 * @param className 追加到容器的类名
 */
export function AuthorGridSkeleton({
  count = 7,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7',
        className,
      )}
    >
      {Array.from({ length: count }).map((_, index) => (
        <AuthorCardSkeleton key={index} />
      ))}
    </div>
  );
}

/**
 * 标签云骨架：宽度参差的胶囊占位，模拟不同长度标签的换行效果。
 * 无参数，固定 16 个占位项。
 */
export function TagCloudSkeleton() {
  const widths = [62, 78, 54, 90, 68, 84, 58, 72, 96, 66, 80, 56, 88, 70, 60, 82];
  return (
    <div className="panel flex flex-wrap gap-2.5 p-5 sm:p-6">
      {widths.map((width, index) => (
        <div key={index} className="skeleton h-9 rounded-full" style={{ width }} />
      ))}
    </div>
  );
}

/**
 * 公告列表骨架：每行包含徽章、时间、标题与摘要占位。
 *
 * @param count 行数，默认 5
 */
export function NoticeListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="panel overflow-hidden">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="border-b border-line px-4 py-4 last:border-b-0 sm:px-5">
          <div className="flex items-center gap-2">
            <div className="skeleton h-5 w-12 rounded" />
            <div className="skeleton h-3 w-12" />
            <div className="skeleton ml-auto h-3 w-20" />
          </div>
          <div className="skeleton mt-2.5 h-4 w-3/4" />
          <div className="skeleton mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/**
 * 站内通知列表骨架：左侧图标 + 标题/徽章/时间 + 摘要的卡片占位。
 *
 * @param count 卡片数量，默认 5
 */
export function NotificationListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex items-start gap-3 rounded-xl border border-line bg-panel p-3.5"
        >
          <div className="skeleton h-9 w-9 shrink-0 rounded-[10px]" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="skeleton h-3.5 w-40" />
              <div className="skeleton h-4 w-10 rounded" />
              <div className="skeleton ml-auto h-3 w-24" />
            </div>
            <div className="skeleton mt-2 h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 购买记录页骨架：顶部三张统计卡 + 下方订单列表占位。
 * 无参数，数量按页面固定结构写死。
 */
export function PurchaseSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="panel px-4 py-3.5">
            <div className="skeleton h-6 w-20" />
            <div className="skeleton mt-2 h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="panel p-4">
        <div className="skeleton h-3 w-24" />
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="mt-3 flex items-center gap-3">
            <div className="skeleton h-11 w-11 rounded-xl" />
            <div className="flex-1">
              <div className="skeleton h-3.5 w-1/3" />
              <div className="skeleton mt-2 h-3 w-1/2" />
            </div>
            <div className="skeleton h-8 w-16 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 作者详情页骨架：横幅 + 标题行 + 5 张图集卡片占位。
 * 无参数，复用了 `AlbumGridSkeleton`。
 */
export function AuthorDetailSkeleton() {
  return (
    <div className="wrap">
      <div className="skeleton h-[190px] w-full rounded-2xl" />
      <div className="mt-6 mb-3.5 flex items-center gap-2">
        <div className="skeleton h-5 w-24" />
        <div className="skeleton h-3 w-16" />
      </div>
      <AlbumGridSkeleton count={5} />
    </div>
  );
}

/**
 * 图集详情骨架：信息卡 + 媒体区 + 右侧信息栏。
 * 无参数，媒体区按 3:4 占位两张，右侧固定三块信息卡。
 */
export function DetailSkeleton() {
  return (
    <div className="wrap pb-24 lg:pb-14">
      <div className="mb-3 flex items-center gap-2">
        <div className="skeleton h-3 w-14" />
        <div className="skeleton h-3 w-10" />
        <div className="skeleton h-3 w-20" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_346px]">
        <div className="min-w-0">
          <div className="rounded-2xl border border-line bg-[#121215] p-5 sm:p-6">
            <div className="skeleton h-7 w-3/4" />
            <div className="skeleton mt-3 h-3 w-52" />
            <div className="skeleton mt-4 h-3 w-full" />
            <div className="skeleton mt-2 h-3 w-5/6" />
            <div className="mt-4 flex flex-wrap gap-2">
              <div className="skeleton h-7 w-20 rounded-md" />
              <div className="skeleton h-7 w-20 rounded-md" />
              <div className="skeleton h-7 w-16 rounded-md" />
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="skeleton aspect-[3/4] w-full rounded-xl" />
            ))}
          </div>
        </div>
        <aside className="space-y-4">
          {[260, 170, 220].map((height, index) => (
            <div key={index} className="panel p-4">
              <div className="skeleton h-4 w-24" />
              <div className="skeleton mt-3 w-full rounded-lg" style={{ height }} />
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}

/**
 * 首页骨架：最近更新 + 个人写真 + 公告。
 * 无参数，内部复用图集/作者/公告骨架组合出整页占位。
 */
export function HomeSkeleton() {
  return (
    <div className="wrap">
      <div className="mb-9">
        <div className="mb-3.5 flex items-center gap-2.5">
          <div className="skeleton h-5 w-24" />
          <div className="skeleton h-3 w-44" />
        </div>
        <AlbumGridSkeleton count={12} className="xl:grid-cols-6" />
      </div>
      <div className="mb-9">
        <div className="mb-3.5 flex items-center gap-2.5">
          <div className="skeleton h-5 w-24" />
        </div>
        <AuthorGridSkeleton count={7} />
      </div>
      <div className="mb-4">
        <div className="skeleton mb-3.5 h-5 w-16" />
        <NoticeListSkeleton count={4} />
      </div>
    </div>
  );
}
