import type { StageRun } from '../pipeline/inputs';
import { describe, it, expectTypeOf } from 'vitest';

describe('StageRun', () => {
  it('has optional trackId and publishTargetId', () => {
    expectTypeOf<StageRun>().toHaveProperty('trackId').toEqualTypeOf<string | null | undefined>();
    expectTypeOf<StageRun>().toHaveProperty('publishTargetId').toEqualTypeOf<string | null | undefined>();
  });
});
