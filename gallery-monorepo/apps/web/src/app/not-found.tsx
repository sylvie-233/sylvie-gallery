import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="wrap flex min-h-[55vh] flex-col items-center justify-center text-center">
      <p className="text-[64px] font-extrabold tracking-tight text-brand">404</p>
      <h1 className="mt-2 text-[18px] font-bold">页面不存在</h1>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-t3">
        你访问的页面可能已被移动、下架或删除。可以返回首页，或去图集页继续浏览。
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/" className="btn btn-brand">
          返回首页
        </Link>
        <Link href="/albums" className="btn btn-outline">
          浏览图集
        </Link>
      </div>
    </div>
  );
}
