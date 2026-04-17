import { AffiliateFraudServer } from '@tn-figueiredo/affiliate-admin/server';
import { adminPath } from '@/lib/admin-path';
import { fetchFraud } from '@/lib/admin/affiliate-queries';

export const dynamic = 'force-dynamic';

export default async function FraudPage() {
  const data = await fetchFraud();
  return (
    <AffiliateFraudServer
      data={data}
      config={{
        basePath: adminPath('/affiliates'),
        locale: 'pt-BR',
        currency: 'BRL',
      }}
    />
  );
}
