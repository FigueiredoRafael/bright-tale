import { AffiliateListServer } from '@tn-figueiredo/affiliate-admin/server';
import { adminPath } from '@/lib/admin-path';
import { fetchAffiliates } from '@/lib/admin/affiliate-queries';

export const dynamic = 'force-dynamic';

function flatten(sp: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') out[k] = v;
    else if (Array.isArray(v) && v.length > 0) out[k] = v[0];
  }
  return out;
}

export default async function AffiliatesListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const flat = flatten(sp);
  const data = await fetchAffiliates(flat);
  return (
    <AffiliateListServer
      data={data}
      config={{
        basePath: adminPath('/affiliates'),
        locale: 'pt-BR',
        currency: 'BRL',
      }}
      searchParams={{ tab: flat.tab, type: flat.type }}
    />
  );
}
