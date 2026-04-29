import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

/**
 * Schema Drift Smoke Tests
 *
 * These tests probe the dev DB to confirm critical schema changes are in place.
 * Catches future migration drift like the projects.channel_id restoration fix.
 *
 * Run with: RUN_INTEGRATION_TESTS=1 npx vitest run apps/api/src/__tests__/integration/schema-drift.test.ts
 */

const RUN_INTEGRATION = process.env.RUN_INTEGRATION_TESTS === '1';

describe.skipIf(!RUN_INTEGRATION)('schema drift smoke', () => {
  it('projects.channel_id column exists and is queryable', async () => {
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !key) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
    const sb = createClient(url, key);
    const { data, error } = await sb.from('projects').select('id, channel_id').limit(1);
    expect(error).toBeNull();
    // Either no rows or at least a row with channel_id property defined (string|null)
    if (data && data.length > 0) {
      expect('channel_id' in data[0]).toBe(true);
    }
  });

  it('autopilot_templates table exists and is queryable', async () => {
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !key) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
    const sb = createClient(url, key);
    const { error } = await sb.from('autopilot_templates').select('id, user_id, channel_id, is_default').limit(1);
    expect(error).toBeNull();
  });
});
