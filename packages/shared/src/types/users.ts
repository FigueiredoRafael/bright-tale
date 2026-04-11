/** API response types for the users page */

export interface UserListItem {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  isPremium: boolean;
  isPremiumEffective: boolean;
  premiumPlan: 'monthly' | 'yearly' | null;
  premiumStartedAt: string | null;
  premiumExpiresAt: string | null;
  isActive: boolean;
  role: 'admin' | 'user';
  createdAt: string;
}

export interface UsersKpis {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  premiumCount: number;
  adminCount: number;
  freeCount: number;
  newToday: number;
  newThisWeek: number;
  newThisMonth: number;
}

export interface UsersSparklines {
  total: number[];
  premium: number[];
  signups: number[];
}

export interface UsersGrowthPoint {
  date: string;
  signups: number;
  premiumSignups: number;
}

export interface UsersPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface UsersPageData {
  data: UserListItem[];
  kpis: UsersKpis;
  sparklines: UsersSparklines;
  growth: UsersGrowthPoint[];
  pagination: UsersPagination;
}
