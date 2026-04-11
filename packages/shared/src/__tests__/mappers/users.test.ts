import { describe, it, expect } from 'vitest';
import { userRowToListItem } from '../../mappers/users';

describe('userRowToListItem', () => {
  const baseRow = {
    id: 'u1',
    email: 'test@example.com',
    first_name: 'John',
    last_name: 'Doe',
    avatar_url: null,
    is_premium: false,
    premium_plan: null,
    premium_started_at: null,
    premium_expires_at: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  it('maps a free user correctly', () => {
    const result = userRowToListItem(baseRow, 'user');
    expect(result).toEqual({
      id: 'u1',
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      avatarUrl: null,
      isPremium: false,
      isPremiumEffective: false,
      premiumPlan: null,
      premiumStartedAt: null,
      premiumExpiresAt: null,
      isActive: true,
      role: 'user',
      createdAt: '2026-01-01T00:00:00Z',
    });
  });

  it('maps a premium user with future expiry as effective', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const row = {
      ...baseRow,
      is_premium: true,
      premium_plan: 'yearly' as const,
      premium_started_at: '2026-01-01T00:00:00Z',
      premium_expires_at: futureDate,
    };
    const result = userRowToListItem(row, 'admin');
    expect(result.isPremium).toBe(true);
    expect(result.isPremiumEffective).toBe(true);
    expect(result.role).toBe('admin');
  });

  it('maps a premium user with past expiry as not effective', () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const row = {
      ...baseRow,
      is_premium: true,
      premium_plan: 'monthly' as const,
      premium_started_at: '2025-12-01T00:00:00Z',
      premium_expires_at: pastDate,
    };
    const result = userRowToListItem(row, 'user');
    expect(result.isPremium).toBe(true);
    expect(result.isPremiumEffective).toBe(false);
  });

  it('maps premium with null expiry as effective (no expiration)', () => {
    const row = {
      ...baseRow,
      is_premium: true,
      premium_plan: 'yearly' as const,
      premium_started_at: '2026-01-01T00:00:00Z',
      premium_expires_at: null,
    };
    const result = userRowToListItem(row, 'user');
    expect(result.isPremiumEffective).toBe(true);
  });
});
