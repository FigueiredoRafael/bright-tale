import { NextRequest } from 'next/server';
import { proxyToApi } from '../../../_shared/proxy';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const { submissionId } = await params;
  return proxyToApi(
    req,
    `/admin/affiliate/content-submissions/${encodeURIComponent(submissionId)}/review`,
    'PUT',
  );
}
