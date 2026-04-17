import { NextRequest } from 'next/server';
import { proxyToApi } from '../../../_shared/proxy';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ flagId: string }> },
) {
  const { flagId } = await params;
  return proxyToApi(
    req,
    `/admin/affiliate/fraud-flags/${encodeURIComponent(flagId)}/resolve`,
    'POST',
  );
}
