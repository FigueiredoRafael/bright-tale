'use client';
import { useCallback } from 'react';
import { usePathname } from 'next/navigation';

export function useAdminPaths() {
  const pathname = usePathname();
  const slug = pathname.split('/')[1];
  const adminPath = useCallback((sub = '') => `/${slug}${sub}`, [slug]);
  const adminApi = useCallback((sub = '') => `/api/${slug}${sub}`, [slug]);
  return { adminPath, adminApi };
}
