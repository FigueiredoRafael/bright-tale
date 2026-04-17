'use client';

function skipped(name: string): never {
  throw new Error(`[affiliate-admin] ${name} not wired in 2C — tracked as TODO-2F`);
}

export async function revalidateTaxId(_affiliateId: string): Promise<void> {
  skipped('revalidateTaxId');
}
export async function addSocialLink(
  _affiliateId: string,
  _platform: string,
  _url: string,
): Promise<void> {
  skipped('addSocialLink');
}
export async function deleteSocialLink(
  _affiliateId: string,
  _platform: string,
): Promise<void> {
  skipped('deleteSocialLink');
}
export async function verifySocialLinks(_affiliateId: string): Promise<void> {
  skipped('verifySocialLinks');
}
