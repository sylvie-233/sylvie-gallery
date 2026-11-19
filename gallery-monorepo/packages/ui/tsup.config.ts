import { defineConfig } from 'tsup';

const external = [
  'react',
  'react-dom',
  'react-dom/client',
  'next',
  'next/link',
  'next/navigation',
  'lucide-react',
];

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    clean: true,
    target: 'es2022',
    external,
  },
  {
    entry: { web: 'src/web/index.ts' },
    format: ['esm'],
    dts: true,
    target: 'es2022',
    external,
    // Web 组件被 Next.js App Router 直接引用，需要标记客户端边界。
    banner: { js: '"use client";' },
  },
  {
    entry: { admin: 'src/admin/index.ts' },
    format: ['esm'],
    dts: true,
    target: 'es2022',
    external,
  },
]);
