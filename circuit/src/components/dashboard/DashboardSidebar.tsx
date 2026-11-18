'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  ClipboardList,
  GalleryHorizontalEnd,
  GraduationCap,
  Grid2X2,
  HelpCircle,
  Home,
  PanelLeftClose,
  Settings,
  Star,
  Trophy,
  UserCircle,
} from 'lucide-react';
import type { IconComponent } from './types';

const navItems = [
  { icon: Home, label: 'Dashboard', href: '/' },
  { icon: UserCircle, label: 'Profile', href: '/profile' },
  { icon: GraduationCap, label: 'Project Outcomes', href: '/classes' },
  // { icon: Grid2X2, label: 'All Projects', href: '/projects' },
  { icon: Star, label: 'Collections', href: '/collections' },
];

const resourceItems = [
  { icon: BookOpen, label: 'Tutorials', href: '/tutorials' },
  { icon: ClipboardList, label: 'Quizzes', href: '/quizzes' },
  { icon: Trophy, label: 'Challenges', href: '/challenges' },
  { icon: GalleryHorizontalEnd, label: 'Gallery', href: '/gallery' },
];

function SidebarItem({
  icon: Icon,
  label,
  href,
  active,
}: {
  icon: IconComponent;
  label: string;
  href: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex h-12 w-full items-center gap-3 rounded-r-[24px] px-6 text-sm font-semibold transition-colors ${
        active
          ? 'border-l-4 border-[#006aa6] bg-[#d7e8f3] text-[#005a95]'
          : 'border-l-4 border-transparent text-[#121b2a] hover:bg-[#eef5fa]'
      }`}
    >
      <Icon size={19} />
      <span>{label}</span>
    </Link>
  );
}

export function DashboardSidebar({ onHide }: { onHide: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="fixed bottom-0 left-0 top-0 z-30 flex w-[222px] flex-col border-r border-[#d0d7df] bg-white">
      <div className="flex items-center justify-between px-4 py-4">
        <span className="text-sm font-bold uppercase tracking-[0.18em] text-[#005a95]">Menu</span>
        <button
          onClick={onHide}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#005a95] transition hover:bg-[#eef5fa]"
          title="Hide sidebar"
        >
          <PanelLeftClose size={19} />
        </button>
      </div>

      <nav className="space-y-1 pr-2">
        {navItems.map((item) => (
          <SidebarItem key={item.label} {...item} active={pathname === item.href} />
        ))}
      </nav>

      <div className="mx-6 my-8 border-t border-[#e5e9ef]" />
      <div className="px-8 pb-4 text-[10px] font-bold uppercase tracking-[0.22em] text-[#111827]">
        Resources
      </div>
      <nav className="space-y-2 pr-2">
        {resourceItems.map((item) => (
          <SidebarItem key={item.label} {...item} active={pathname === item.href} />
        ))}
      </nav>

      <div className="mt-auto border-t border-[#d0d7df] py-4 pr-2">
        <SidebarItem icon={Settings} label="Settings" href="/settings" active={pathname === '/settings'} />
        <SidebarItem icon={HelpCircle} label="Help center" href="/help" active={pathname === '/help'} />
      </div>
    </aside>
  );
}
