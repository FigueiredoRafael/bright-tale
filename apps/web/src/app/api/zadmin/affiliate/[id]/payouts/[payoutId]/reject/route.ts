import { NextRequest } from 'next/server';
import { proxyToApi } from '../../../../_shared/proxy';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; payoutId: string }> },
) {
  const { id, payoutId } = await params;
  return proxyToApi(
    req,
    `/admin/affiliate/${encodeURIComponent(id)}/payouts/${encodeURIComponent(payoutId)}/reject`,
    'POST',
  );
}
