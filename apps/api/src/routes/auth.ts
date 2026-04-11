import type { FastifyInstance } from 'fastify';
import { registerAuthRoutes } from '@tn-figueiredo/auth-fastify';
import type { IAuthUserProfileRepository } from '@tn-figueiredo/auth';
import {
  SignUpUseCase,
  SocialSignInUseCase,
  SetPasswordUseCase,
  ChangePasswordUseCase,
  ChangeEmailUseCase,
  VerifyEmailOtpUseCase,
  ResendSignupConfirmationUseCase,
} from '@tn-figueiredo/auth/use-cases';
import { SupabaseAuthService } from '@tn-figueiredo/auth-supabase';
import { createServiceClient } from '../lib/supabase/index.js';

// Minimal profiles stub — ChangeEmailUseCase requires this repo but bright-tale
// does not use referral codes or auth providers in its own user_profiles table.
// The stub returns null for all lookups, which is safe for the change-email flow.
const nullProfilesRepo: IAuthUserProfileRepository = {
  findByUserId: async () => null,
  findByReferralCode: async () => null,
  create: async () => undefined,
  saveAcquisitionSource: async () => undefined,
  getWelcomeEmailSentAt: async () => null,
  setWelcomeEmailSentAt: async () => undefined,
};

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const authService = new SupabaseAuthService({ supabaseUrl: url, supabaseServiceKey: key });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;

  registerAuthRoutes(fastify, {
    authService,
    signUp: new SignUpUseCase({ auth: authService }),
    socialSignIn: new SocialSignInUseCase({ auth: authService }),
    setPassword: new SetPasswordUseCase({ auth: authService }),
    changePassword: new ChangePasswordUseCase({ auth: authService }),
    changeEmail: new ChangeEmailUseCase({ auth: authService, profiles: nullProfilesRepo }),
    verifyOtp: new VerifyEmailOtpUseCase({ auth: authService }),
    resendOtp: new ResendSignupConfirmationUseCase({ auth: authService }),
    hooks: {
      onPostSignUp: async ({ userId }) => {
        // Create user_profiles row when a new user signs up via email/password.
        // Upsert with ignoreDuplicates: true makes this safe for email-confirm
        // resend flows (same userId, no error on second call).
        await supabase
          .from('user_profiles')
          .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });
      },
    },
  });
}
