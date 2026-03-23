'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { useBreadcrumbStore } from '@/lib/breadcrumb-store';

const pathLabels: Record<string, string> = {
  dashboard: 'ダッシュボード',
  projects: 'プロジェクト',
  tasks: 'タスク',
  notifications: '通知',
  invitations: '招待',
  chat: 'AIチャット',
  reports: 'レポート',
  activity: 'アクティビティ',
  settings: '設定',
  account: 'アカウント',
  password: 'パスワード',
  profile: 'プロフィール',
};

export function Breadcrumb() {
  const { segments } = useBreadcrumbStore();
  const pathname = usePathname();

  // storeにセグメントがあればそれを使う
  const displaySegments = segments.length > 0
    ? segments
    : (() => {
        const parts = pathname.split('/').filter(Boolean);
        if (parts.length === 0) return [];
        return parts.map((part, i) => ({
          label: pathLabels[part] || part,
          href: i < parts.length - 1 ? '/' + parts.slice(0, i + 1).join('/') : undefined,
        }));
      })();

  if (displaySegments.length === 0) return null;

  return (
    <nav className="flex items-center gap-1 text-sm text-gray-500 mb-4 min-h-[28px]">
      {displaySegments.map((seg, i) => {
        const isLast = i === displaySegments.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
            {isLast || !seg.href ? (
              <span className={isLast ? 'text-gray-900 font-medium truncate max-w-[200px]' : 'truncate max-w-[200px]'}>
                {seg.label}
              </span>
            ) : (
              <Link href={seg.href} className="hover:text-gray-700 transition-colors truncate max-w-[200px]">
                {seg.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
