import { AffiliatePayoutsServer } from '@tn-figueiredo/affiliate-admin/server';
import { adminPath } from '@/lib/admin-path';
import { fetchPayouts } from '@/lib/admin/affiliate-queries';

export const dynamic = 'force-dynamic';

export default async function PayoutsPage() {
  const data = await fetchPayouts();
  return (
    <AffiliatePayoutsServer
      data={data}
      config={{
        basePath: adminPath('/affiliates'),
        locale: 'pt-BR',
        currency: 'BRL',
      }}
    />
  );
}
