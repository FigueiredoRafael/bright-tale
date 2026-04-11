import { z } from 'zod';

/** GET /users query params */
export const usersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  premium: z.enum(['all', 'true', 'false']).default('all'),
  active: z.enum(['all', 'true', 'false']).default('all'),
  role: z.enum(['all', 'admin']).default('all'),
  sort: z.enum(['first_name', 'email', 'created_at', 'is_premium']).default('created_at'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type UsersQuery = z.infer<typeof usersQuerySchema>;

/** PATCH /users/:id body */
export const userUpdateSchema = z
  .object({
    firstName: z.string().min(1).max(200).optional(),
    lastName: z.string().min(1).max(200).optional(),
    isPremium: z.boolean().optional(),
    premiumPlan: z.enum(['monthly', 'yearly']).optional(),
    premiumExpiresAt: z.string().datetime().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.isPremium === true) {
        return data.premiumPlan !== undefined && data.premiumExpiresAt !== undefined;
      }
      return true;
    },
    { message: 'premiumPlan and premiumExpiresAt are required when isPremium is true' },
  );

export type UserUpdate = z.infer<typeof userUpdateSchema>;

/** PATCH /users/:id/role body */
export const userRoleUpdateSchema = z.object({
  role: z.enum(['admin', 'user']),
});

export type UserRoleUpdate = z.infer<typeof userRoleUpdateSchema>;
