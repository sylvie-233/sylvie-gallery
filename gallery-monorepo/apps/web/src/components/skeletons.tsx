import { cn } from '@sylvie/utils';

const MASONRY_HEIGHTS = [300, 338, 372, 404, 320, 352];

/** 图集卡片骨架：与真实卡片保持同样的圆角、图片比例与信息行高度。 */
export function AlbumCardSkeleton({
  masonry = false,
  index = 0,
}: {
  masonry?: boolean;
  index?: number;
}) {
  const height = MASONRY_HEIGHTS[index % MASONRY_HEIGHTS.length] ?? 340;
  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-panel">
      <div
        className={cn('skeleton w-full rounded-none', !masonry && 'aspect-[3/4]')}
        style={masonry ? { height } : undefined}
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

/** 作者卡骨架：方形封面 + 图集数徽章 + 名称条。 */
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

export function TagCloudSkeleton() {
  const widths = [62, 78, 54, 90, 68, 84, 58, 72, 96, 66, 80, 56, 88, 70, 60, 82];
  return (
    <div className="panel flex flex-wrap gap-2.5 p-5 sm:p-6">
      {widths.map((width, index) => (
        <div
          key={index}
          className="skeleton h-9 rounded-full"
          style={{ width }}
        />
      ))}
    </div>
  );
}

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

/** 图集详情骨架：信息卡 + 媒体区 + 右侧信息栏。 */
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
              <div key={index} className="skeleton aspect-[3/4] max-h-[76vh] w-full rounded-xl" />
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

/** 首页骨架：最近更新 + 个人写真 + 公告。 */
export function HomeSkeleton() {
  return (
    <div className="wrap">
      <div className="mb-9">
        <div className="mb-3.5 flex items-center gap-2.5">
          <div className="skeleton h-5 w-24" />
          <div className="skeleton h-3 w-44" />
        </div>
        <AlbumGridSkeleton
          count={12}
          className="xl:grid-cols-6"
        />
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
