import type { UserListItem } from '../types/users';

/** Shape of a user_profiles row from the database (snake_case) */
export interface UserProfileRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  is_premium: boolean;
  premium_plan: string | null;
  premium_started_at: string | null;
  premium_expires_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Convert a user_profiles DB row + role into a camelCase API response item.
 * Computes isPremiumEffective from is_premium + premium_expires_at.
 */
export function userRowToListItem(
  row: UserProfileRow,
  role: 'admin' | 'user',
): UserListItem {
  const isPremiumEffective =
    row.is_premium &&
    (row.premium_expires_at === null || new Date(row.premium_expires_at) >= new Date());

  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    avatarUrl: row.avatar_url,
    isPremium: row.is_premium,
    isPremiumEffective,
    premiumPlan: row.premium_plan as 'monthly' | 'yearly' | null,
    premiumStartedAt: row.premium_started_at,
    premiumExpiresAt: row.premium_expires_at,
    isActive: row.is_active,
    role,
    createdAt: row.created_at,
  };
}
