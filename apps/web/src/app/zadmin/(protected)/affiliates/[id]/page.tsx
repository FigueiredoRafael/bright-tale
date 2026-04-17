import { AffiliateDetailServer } from '@tn-figueiredo/affiliate-admin/server';
import { adminPath } from '@/lib/admin-path';
import { fetchAffiliateDetail } from '@/lib/admin/affiliate-queries';

export const dynamic = 'force-dynamic';

export default async function AffiliateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await fetchAffiliateDetail(id);
  return (
    <AffiliateDetailServer
      data={data}
      config={{
        basePath: adminPath('/affiliates'),
        locale: 'pt-BR',
        currency: 'BRL',
      }}
    />
  );
}
