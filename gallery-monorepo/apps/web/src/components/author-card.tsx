import Link from 'next/link';
import { Images } from 'lucide-react';

import type { AuthorDto } from '@sylvie/types';
import { cn } from '@sylvie/utils';
import { CoverImage } from '@sylvie/ui/web';


interface AuthorCardProps {
  author: AuthorDto;
  className?: string;
}

/** 作者图卡：1:1 封面 + 图集数徽章 + 作者名。 */
export function AuthorCard({ author, className }: AuthorCardProps) {
  return (
    <Link href={`/authors/${author.id}`} className={cn('group block', className)}>
      <div className="relative overflow-hidden rounded-xl border border-line bg-[#16161a] transition group-hover:-translate-y-1 group-hover:border-line2 group-hover:shadow-[0_10px_22px_rgba(0,0,0,.42)]">
        <div className="aspect-square">
          <CoverImage
            src={author.coverUrl ?? ''}
            alt={author.name}
            fallback={author.initial}
            eager
          />
        </div>
        <span className="pill absolute right-2 top-2">
          <Images size={11} />
          {author.albumCount}
        </span>
      </div>
      <p className="mt-2 truncate text-center text-[13px] font-semibold text-[#e6e6ea] transition group-hover:text-brand2">
        {author.name}
      </p>
    </Link>
  );
}
