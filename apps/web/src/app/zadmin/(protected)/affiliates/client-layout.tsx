'use client';
import { AffiliateAdminProvider } from '@tn-figueiredo/affiliate-admin';
import type { AffiliateAdminConfig } from '@tn-figueiredo/affiliate-admin';
import { adminPath } from '@/lib/admin-path';
import { actions } from './actions';

const config: AffiliateAdminConfig = {
  basePath: adminPath('/affiliates'),
  locale: 'pt-BR',
  currency: 'BRL',
};

export default function AffiliateAdminClientLayout({
  children,
}: { children: React.ReactNode }) {
  return (
    <AffiliateAdminProvider config={config} actions={actions}>
      {children}
    </AffiliateAdminProvider>
  );
}
