import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

// Mock exportJobs module
const mockCreateExportJob = vi.fn();
const mockGetExportJob = vi.fn();
const mockGetExportPayload = vi.fn();

vi.mock('@/lib/exportJobs', () => ({
  createExportJob: (...args: any[]) => mockCreateExportJob(...args),
  getExportJob: (...args: any[]) => mockGetExportJob(...args),
  getExportPayload: (...args: any[]) => mockGetExportPayload(...args),
}));

vi.mock('@/middleware/authenticate', () => ({
  authenticate: vi.fn(async (request: any, reply: any) => {
    const key = request.headers['x-internal-key'];
    if (!key || key !== process.env.INTERNAL_API_KEY) {
      return reply.status(401).send({
        data: null,
        error: { message: 'Unauthorized', code: 'UNAUTHORIZED' },
      });
    }
    const userId = request.headers['x-user-id'];
    request.userId = typeof userId === 'string' ? userId : undefined;
  }),
}));

vi.stubEnv('INTERNAL_API_KEY', 'test-key');

import { exportRoutes } from '../../routes/export';

const AUTH = { 'x-internal-key': 'test-key' };

const VALID_PROJECT_ID = 'cltest00000000000000000001';

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  app = Fastify({ logger: false });
  await app.register(exportRoutes, { prefix: '/export' });
  await app.ready();
});

describe('POST /export/jobs', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/export/jobs',
      payload: { project_ids: [VALID_PROJECT_ID] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with wrong auth key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/export/jobs',
      headers: { 'x-internal-key': 'wrong-key' },
      payload: { project_ids: [VALID_PROJECT_ID] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('creates export job and returns job_id', async () => {
    mockCreateExportJob.mockResolvedValueOnce('job-abc-123');

    const res = await app.inject({
      method: 'POST',
      url: '/export/jobs',
      headers: AUTH,
      payload: { project_ids: [VALID_PROJECT_ID] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.job_id).toBe('job-abc-123');
    // Raw JSON — no data/error envelope
    expect(body.data).toBeUndefined();
    expect(body.error).toBeUndefined();
  });

  it('returns 400 for empty project_ids array', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/export/jobs',
      headers: AUTH,
      payload: { project_ids: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for missing project_ids', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/export/jobs',
      headers: AUTH,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for non-cuid project_ids', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/export/jobs',
      headers: AUTH,
      payload: { project_ids: ['not-a-cuid'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when createExportJob throws', async () => {
    mockCreateExportJob.mockRejectedValueOnce(new Error('DB error'));

    const res = await app.inject({
      method: 'POST',
      url: '/export/jobs',
      headers: AUTH,
      payload: { project_ids: [VALID_PROJECT_ID] },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('DB error');
  });
});

describe('GET /export/jobs/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/export/jobs/job-123',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when job not found', async () => {
    mockGetExportJob.mockReturnValueOnce(null);

    const res = await app.inject({
      method: 'GET',
      url: '/export/jobs/nonexistent-job',
      headers: AUTH,
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toBe('Not found');
  });

  it('returns job status when found', async () => {
    mockGetExportJob.mockReturnValueOnce({
      id: 'job-123',
      status: 'done',
      projectIds: [VALID_PROJECT_ID],
      createdAt: Date.now(),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/export/jobs/job-123',
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.job_id).toBe('job-123');
    expect(body.status).toBe('done');
    // Raw JSON — no data/error envelope
    expect(body.data).toBeUndefined();
  });

  it('returns pending status for in-progress job', async () => {
    mockGetExportJob.mockReturnValueOnce({
      id: 'job-pending',
      status: 'pending',
      projectIds: [VALID_PROJECT_ID],
      createdAt: Date.now(),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/export/jobs/job-pending',
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('pending');
  });
});

describe('GET /export/jobs/:id/download', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/export/jobs/job-123/download',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when payload not ready', async () => {
    mockGetExportPayload.mockReturnValueOnce(null);

    const res = await app.inject({
      method: 'GET',
      url: '/export/jobs/not-ready/download',
      headers: AUTH,
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toBe('Not ready or not found');
  });

  it('returns JSON attachment with Content-Disposition header', async () => {
    const mockPayload = { projects: [{ id: 'p-1', title: 'Test Project' }] };
    mockGetExportPayload.mockReturnValueOnce(mockPayload);

    const res = await app.inject({
      method: 'GET',
      url: '/export/jobs/job-abc/download',
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('projects-export-job-abc.json');

    const body = res.json();
    expect(body.projects).toBeDefined();
    expect(body.projects[0].id).toBe('p-1');
  });
});
