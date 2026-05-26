'use client';
import { AffiliateAdminProvider } from '@tn-figueiredo/affiliate-admin';
import type { AffiliateAdminConfig } from '@tn-figueiredo/affiliate-admin';
import { useAdminPaths } from '@/lib/use-admin-paths';
import { actions } from './actions';

export default function AffiliateAdminClientLayout({
  children,
}: { children: React.ReactNode }) {
  const { adminPath } = useAdminPaths();
  const config: AffiliateAdminConfig = {
    basePath: adminPath('/affiliates'),
    locale: 'pt-BR',
    currency: 'BRL',
  };

  return (
    <AffiliateAdminProvider config={config} actions={actions}>
      {children}
    </AffiliateAdminProvider>
  );
}
