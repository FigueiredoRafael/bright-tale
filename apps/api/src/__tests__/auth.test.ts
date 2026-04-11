import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';

// =============================================================================
// MOCKS — vi.hoisted() runs before any import, so mocks are available
// throughout the file including inside vi.mock() factories.
// =============================================================================

const mockSignUpExecute = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    user: { id: 'user-uuid-123', email: 'test@brighttale.io' },
    session: null,
    requiresEmailVerification: false,
    isNewUser: true,
  }),
);

const mockAuthService = vi.hoisted(() => ({
  signUp: vi.fn(),
  signIn: vi.fn().mockResolvedValue({
    user: { id: 'user-uuid-123', email: 'test@brighttale.io' },
    session: { access_token: 'mock-jwt', refresh_token: 'mock-refresh' },
  }),
  signInWithIdToken: vi.fn(),
  refreshSession: vi.fn(),
  validateToken: vi.fn().mockRejectedValue(
    Object.assign(new Error('Invalid token'), { code: 'INVALID_TOKEN' }),
  ),
  signOut: vi.fn(),
  deleteUser: vi.fn(),
  updatePassword: vi.fn(),
  getUserProviders: vi.fn(),
  getUserById: vi.fn(),
  updateUserEmail: vi.fn(),
  verifyEmailOtp: vi.fn(),
  resendSignupConfirmation: vi.fn(),
}));

const mockUpsert = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ data: null, error: null }),
);

// Mock all use cases — auth-fastify constructs them and calls .execute()
// Must use regular function (not arrow) so they work with `new UseCase(...)`
vi.mock('@tn-figueiredo/auth/use-cases', () => ({
  SignUpUseCase: vi.fn().mockImplementation(function () {
    return { execute: mockSignUpExecute };
  }),
  SocialSignInUseCase: vi.fn().mockImplementation(function () {
    return { execute: vi.fn() };
  }),
  SetPasswordUseCase: vi.fn().mockImplementation(function () {
    return { execute: vi.fn() };
  }),
  ChangePasswordUseCase: vi.fn().mockImplementation(function () {
    return { execute: vi.fn() };
  }),
  ChangeEmailUseCase: vi.fn().mockImplementation(function () {
    return { execute: vi.fn() };
  }),
  VerifyEmailOtpUseCase: vi.fn().mockImplementation(function () {
    return { execute: vi.fn() };
  }),
  ResendSignupConfirmationUseCase: vi.fn().mockImplementation(function () {
    return { execute: vi.fn() };
  }),
}));

// Mock SupabaseAuthService — constructor returns mockAuthService
// Must use function (not arrow) so it works with `new SupabaseAuthService(...)`
vi.mock('@tn-figueiredo/auth-supabase', () => ({
  SupabaseAuthService: vi.fn().mockImplementation(function () {
    return mockAuthService;
  }),
}));

// Mock Supabase client used in the onPostSignUp hook
vi.mock('@/lib/supabase/index', () => ({
  createServiceClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({ upsert: mockUpsert }),
  }),
}));

// Stub env vars read inside authRoutes() at plugin registration time
vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');

// =============================================================================
// IMPORTS — must come after vi.mock() declarations
// =============================================================================

import { authRoutes } from '@/routes/auth';

// =============================================================================
// TESTS
// =============================================================================

describe('Auth routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-apply default resolved values after clearAllMocks resets mock state
    mockSignUpExecute.mockResolvedValue({
      user: { id: 'user-uuid-123', email: 'test@brighttale.io' },
      session: null,
      requiresEmailVerification: false,
      isNewUser: true,
    });
    mockAuthService.signIn.mockResolvedValue({
      user: { id: 'user-uuid-123', email: 'test@brighttale.io' },
      session: { access_token: 'mock-jwt', refresh_token: 'mock-refresh' },
    });
    mockAuthService.validateToken.mockRejectedValue(
      Object.assign(new Error('Invalid token'), { code: 'INVALID_TOKEN' }),
    );
    mockUpsert.mockResolvedValue({ data: null, error: null });

    // Create a minimal Fastify instance that mirrors server.ts registration order
    app = Fastify();
    await app.register(fastifyCookie);
    await app.register(authRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  // ── POST /auth/signup ──────────────────────────────────────────────────────

  describe('POST /auth/signup', () => {
    it('returns 400 when body is missing required fields', async () => {
      // signUpSchema requires: email, password, ageConfirmation
      const res = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().success).toBe(false);
    });

    it('returns 400 when ageConfirmation is missing (required by signUpSchema)', async () => {
      // ageConfirmation: z.boolean() is NOT optional — omitting it fails validation.
      const res = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: { email: 'test@brighttale.io', password: 'Password123!' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().success).toBe(false);
    });

    it('returns 200 and user data when all required fields provided', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: {
          email: 'test@brighttale.io',
          password: 'Password123!',
          ageConfirmation: true,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ success: boolean; data: { user: { email: string } } }>();
      expect(body.success).toBe(true);
      expect(body.data.user.email).toBe('test@brighttale.io');
    });

    it('calls onPostSignUp hook and upserts user_profiles row after signup', async () => {
      await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: {
          email: 'test@brighttale.io',
          password: 'Password123!',
          ageConfirmation: true,
        },
      });

      // onPostSignUp fires fire-and-forget — wait a tick for it to settle
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockUpsert).toHaveBeenCalledWith(
        { id: 'user-uuid-123' },
        { onConflict: 'id', ignoreDuplicates: true },
      );
    });

    it('logs error when onPostSignUp upsert fails but still returns 200', async () => {
      mockUpsert.mockResolvedValue({ data: null, error: { message: 'DB error', code: '500' } });
      const logSpy = vi.spyOn(app.log, 'error');

      const res = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: {
          email: 'test@brighttale.io',
          password: 'Password123!',
          ageConfirmation: true,
        },
      });

      // Signup still succeeds — hook failure doesn't break the response
      expect(res.statusCode).toBe(200);

      // Wait for fire-and-forget hook to settle
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-uuid-123' }),
        'onPostSignUp: failed to upsert user_profiles',
      );
    });
  });

  // ── POST /auth/signin ──────────────────────────────────────────────────────

  describe('POST /auth/signin', () => {
    it('returns 200 with session in JSON body when credentials are valid', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/signin',
        payload: { email: 'test@brighttale.io', password: 'Password123!' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ success: boolean; data: { session: { access_token: string } } }>();
      expect(body.success).toBe(true);
      // auth-fastify returns session in JSON body, not in a cookie
      expect(body.data.session.access_token).toBe('mock-jwt');
    });
  });

  // ── Protected routes (Bearer token auth) ──────────────────────────────────

  describe('DELETE /account (protected route)', () => {
    it('returns 401 with "No token provided" when Authorization header is absent', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/account' });

      expect(res.statusCode).toBe(401);
      const body = res.json<{ success: boolean; error: string }>();
      expect(body.success).toBe(false);
      expect(body.error).toBe('No token provided');
    });

    it('returns 401 when Bearer token fails validateToken', async () => {
      // mockAuthService.validateToken rejects by default (set in beforeEach)
      const res = await app.inject({
        method: 'DELETE',
        url: '/account',
        headers: { authorization: 'Bearer invalid-token-xyz' },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json<{ success: boolean; error: string }>();
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/token/i);
    });
  });
});
