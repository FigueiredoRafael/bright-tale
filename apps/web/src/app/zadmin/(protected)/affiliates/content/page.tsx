import { AffiliateContentServer } from '@tn-figueiredo/affiliate-admin/server';
import { adminPath } from '@/lib/admin-path';
import { fetchContent } from '@/lib/admin/affiliate-queries';

export const dynamic = 'force-dynamic';

export default async function ContentPage() {
  const { items } = await fetchContent();
  return (
    <AffiliateContentServer
      data={items}
      config={{
        basePath: adminPath('/affiliates'),
        locale: 'pt-BR',
        currency: 'BRL',
      }}
    />
  );
}
