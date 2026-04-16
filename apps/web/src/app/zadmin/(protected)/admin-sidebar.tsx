'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Building2, Bot, BarChart3,
} from 'lucide-react';
import { adminPath } from '@/lib/admin-path';
import { ThemeToggle } from './theme-toggle';

const SECTIONS = [
  {
    group: 'Principal',
    items: [
      { label: 'Dashboard', path: adminPath(), icon: LayoutDashboard },
    ],
  },
  {
    group: 'Gestão',
    items: [
      { label: 'Usuários', path: adminPath('/users'), icon: Users },
      { label: 'Organizations', path: adminPath('/orgs'), icon: Building2 },
      { label: 'Agentes', path: adminPath('/agents'), icon: Bot },
      { label: 'Analytics', path: adminPath('/analytics'), icon: BarChart3 },
    ],
  },
];

function isActive(pathname: string, itemPath: string): boolean {
  // Dashboard: exact match only
  if (itemPath === adminPath()) {
    return pathname === itemPath;
  }
  // Other pages: prefix match
  return pathname === itemPath || pathname.startsWith(itemPath + '/');
}

interface AdminSidebarProps {
  userEmail: string;
}

export function AdminSidebarCustom({ userEmail }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-[#0F1620] text-slate-100 flex flex-col h-full shrink-0">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-[#1E2E40]">
        <span className="font-bold text-lg tracking-tight">BrightTale</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {SECTIONS.map((section) => (
          <div key={section.group} className="mb-6">
            <p className="px-6 mb-2 text-[11px] font-semibold text-[#2DD4A8] uppercase tracking-widest">
              {section.group}
            </p>
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.path);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex items-center gap-3 mx-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                    active
                      ? 'bg-[rgba(45,212,168,0.10)] text-[#2DD4A8] font-medium shadow-[inset_3px_0_0_#2DD4A8]'
                      : 'text-[#94A3B8] hover:bg-[rgba(45,212,168,0.06)] hover:text-[#F0F4F8]'
                  }`}
                >
                  <Icon size={16} className={active ? 'text-[#2DD4A8]' : ''} />
                  <span className="flex-1">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Theme toggle */}
      <div className="px-3 py-2 border-t border-[#1E2E40]">
        <ThemeToggle />
      </div>

      {/* User email */}
      <div className="px-6 py-4 border-t border-[#1E2E40]">
        <p className="text-xs text-[#64748B] truncate">{userEmail}</p>
      </div>
    </aside>
  );
}
