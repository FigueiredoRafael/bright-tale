'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu, X, Activity, Shield, Users, Package, Star, Settings,
  Database, TrendingUp, FileText, Bell, Globe, Headphones,
  BarChart3, ClipboardList, LogOut, ChevronRight,
} from 'lucide-react';
import { useAdminPaths } from '@/lib/use-admin-paths';

const ICON_MAP: Record<string, React.ElementType> = {
  Activity, Shield, Users, Package, Star, Settings, Database,
  TrendingUp, FileText, Bell, Globe, Headphones, BarChart3, ClipboardList,
};

export function MobileAdminShell({
  userEmail,
  children,
}: {
  userEmail: string;
  children: React.ReactNode;
}) {
  const { adminPath } = useAdminPaths();
  const NAV_SECTIONS = [
    {
      group: 'Principal',
      items: [{ label: 'Dashboard', path: adminPath(), icon: 'Activity' }],
    },
    {
      group: 'Gestão',
      items: [
        { label: 'Managers', path: adminPath('/managers'), icon: 'Shield' },
        { label: 'Usuários', path: adminPath('/users'), icon: 'Users' },
        { label: 'Organizations', path: adminPath('/orgs'), icon: 'Package' },
        { label: 'Agentes', path: adminPath('/agents'), icon: 'Star' },
        { label: 'Providers', path: adminPath('/providers'), icon: 'Database' },
        { label: 'Afiliados', path: adminPath('/affiliates'), icon: 'TrendingUp' },
      ],
    },
    {
      group: 'Monetização',
      items: [
        { label: 'Planos', path: adminPath('/plans'), icon: 'FileText' },
        { label: 'Cupons', path: adminPath('/coupons'), icon: 'Bell' },
      ],
    },
    {
      group: 'Operações',
      items: [
        { label: 'Notificações', path: adminPath('/notifications'), icon: 'Bell' },
        { label: 'Suporte', path: adminPath('/support'), icon: 'Headphones' },
        { label: 'Refunds', path: adminPath('/refunds'), icon: 'Activity' },
        { label: 'Finance', path: adminPath('/finance'), icon: 'BarChart3' },
        { label: 'Audit Log', path: adminPath('/audit-log'), icon: 'ClipboardList' },
      ],
    },
    {
      group: 'Sistema',
      items: [
        { label: 'Analytics', path: adminPath('/analytics'), icon: 'BarChart3' },
        { label: 'Settings', path: adminPath('/settings'), icon: 'Settings' },
      ],
    },
  ];

  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on navigation — read pathname in render, derive open state
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    if (open) setOpen(false);
  }
  // Prevent body scroll when drawer open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 shrink-0 bg-slate-900">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="font-bold text-sm text-[#2DD4A8]">BrightTale Admin</span>
        <div className="ml-auto text-xs text-slate-400 truncate max-w-[160px]">{userEmail}</div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto bg-slate-950 p-4">
        {children}
      </main>

      {/* Drawer backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <nav
        className={`fixed left-0 top-0 z-50 h-full w-72 flex flex-col bg-slate-900 border-r border-slate-800 shadow-2xl transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-800 shrink-0">
          <span className="font-bold text-[#2DD4A8]">BrightTale Admin</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav items */}
        <div className="flex-1 overflow-y-auto py-2">
          {NAV_SECTIONS.map((section) => (
            <div key={section.group} className="mb-1">
              <p className="px-4 py-1.5 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                {section.group}
              </p>
              {section.items.map((item) => {
                const Icon = ICON_MAP[item.icon] ?? ChevronRight;
                const isActive = pathname === item.path || (item.path !== adminPath() && pathname.startsWith(item.path));
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      isActive
                        ? 'bg-[#2DD4A8]/10 text-[#2DD4A8] font-medium'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 p-4 shrink-0">
          <p className="text-xs text-slate-500 mb-3 truncate">{userEmail}</p>
          <Link
            href={adminPath('/logout')}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </Link>
        </div>
      </nav>
    </div>
  );
}
