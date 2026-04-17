import { describe, it, expect } from 'vitest';
import {
  revalidateTaxId, addSocialLink, deleteSocialLink, verifySocialLinks,
} from '@/app/zadmin/(protected)/affiliates/actions/skipped-2f';

const MARKER = /not wired in 2C — tracked as TODO-2F/;

describe('skipped-2f stubs', () => {
  it('revalidateTaxId throws with TODO-2F marker', async () => {
    await expect(revalidateTaxId('aff-1')).rejects.toThrow(MARKER);
  });
  it('addSocialLink throws with TODO-2F marker', async () => {
    await expect(addSocialLink('aff-1', 'youtube', 'https://y.com/a')).rejects.toThrow(MARKER);
  });
  it('deleteSocialLink throws with TODO-2F marker', async () => {
    await expect(deleteSocialLink('aff-1', 'youtube')).rejects.toThrow(MARKER);
  });
  it('verifySocialLinks throws with TODO-2F marker', async () => {
    await expect(verifySocialLinks('aff-1')).rejects.toThrow(MARKER);
  });
});
