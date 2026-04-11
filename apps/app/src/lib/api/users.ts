import type { UsersPageData, UserListItem } from '@brighttale/shared/types/users';

export interface UsersListParams {
  page?: number;
  search?: string;
  premium?: string;
  active?: string;
  role?: string;
  sort?: string;
  sortDir?: string;
}

export async function fetchUsersList(params: UsersListParams = {}): Promise<UsersPageData> {
  const qp = new URLSearchParams();
  if (params.page) qp.set('page', String(params.page));
  if (params.search) qp.set('search', params.search);
  if (params.premium && params.premium !== 'all') qp.set('premium', params.premium);
  if (params.active && params.active !== 'all') qp.set('active', params.active);
  if (params.role && params.role !== 'all') qp.set('role', params.role);
  if (params.sort) qp.set('sort', params.sort);
  if (params.sortDir) qp.set('sortDir', params.sortDir);

  const url = `/api/users${qp.toString() ? `?${qp.toString()}` : ''}`;
  const res = await fetch(url);

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: 'Failed to fetch users' } }));
    throw new Error(body.error?.message || 'Failed to fetch users');
  }

  const json = await res.json();
  return json.data;
}

export async function fetchUser(id: string): Promise<UserListItem> {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: 'Failed to fetch user' } }));
    throw new Error(body.error?.message || 'Failed to fetch user');
  }
  const json = await res.json();
  return json.data;
}

export async function updateUser(
  id: string,
  body: {
    firstName?: string;
    lastName?: string;
    isPremium?: boolean;
    premiumPlan?: 'monthly' | 'yearly';
    premiumExpiresAt?: string;
    isActive?: boolean;
  },
): Promise<void> {
  const res = await fetch(`/api/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: { message: 'Failed to update user' } }));
    throw new Error(data.error?.message || 'Failed to update user');
  }
}

export async function updateUserRole(id: string, role: 'admin' | 'user'): Promise<void> {
  const res = await fetch(`/api/users/${id}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: { message: 'Failed to update role' } }));
    throw new Error(data.error?.message || 'Failed to update role');
  }
}

export async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: { message: 'Failed to delete user' } }));
    throw new Error(data.error?.message || 'Failed to delete user');
  }
}
