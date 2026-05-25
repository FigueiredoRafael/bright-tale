'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAdminPaths } from '@/lib/use-admin-paths';
import { Bot, Wrench } from 'lucide-react';

export function AgentsNav() {
  const { adminPath } = useAdminPaths();
  const tabs = [
    { label: 'Agents', path: adminPath('/agents'), icon: Bot },
    { label: 'Tools', path: adminPath('/agents/tools'), icon: Wrench },
  ];
  const pathname = usePathname();

  return (
    <div className="flex gap-1 border-b border-border mb-6 -mt-2">
      {tabs.map(({ label, path, icon: Icon }) => {
        const active = pathname === path || (path !== adminPath('/agents') && pathname.startsWith(path));
        return (
          <Link
            key={path}
            href={path}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
              active
                ? 'border-[#2DD4A8] text-[#2DD4A8] font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon size={14} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
