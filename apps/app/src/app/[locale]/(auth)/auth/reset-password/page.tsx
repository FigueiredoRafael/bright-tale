'use client';

/**
 * Reset password — user-facing app.
 *
 * Flow: user clicks the link emailed by Supabase → lands here with a
 * recovery token set in the session. Supabase's client fires an
 * onAuthStateChange event `PASSWORD_RECOVERY` once the token is
 * consumed; at that point we enable the password form. When the user
 * submits the new password, `supabase.auth.updateUser({ password })`
 * writes it.
 *
 * Security:
 *   • The token's lifetime is configured in the Supabase dashboard
 *     (Auth → Settings → OTP Expiration — recommended 600s).
 *   • We don't accept the new password until the PASSWORD_RECOVERY
 *     event fires — prevents landing-without-token from offering the
 *     form.
 *   • Server-side validation is performed by Supabase (min length,
 *     breached-password check if enabled).
 */

import { useEffect, useState } from 'react';
import { useRouter, Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { toast } from 'sonner';

type State = 'waiting' | 'ready' | 'submitting' | 'done' | 'invalid';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [state, setState] = useState<State>('waiting');

  useEffect(() => {
    const supabase = createClient();
    // If the user already has a fresh recovery event, enable the form.
    // Otherwise we wait for Supabase to emit PASSWORD_RECOVERY.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setState('ready');
    });

    // Fallback: if the user landed without a recovery token (e.g., copy-
    // pasted the page URL after the token expired), give them 3 s before
    // marking the page as invalid.
    const t = setTimeout(() => {
      setState((s) => (s === 'waiting' ? 'invalid' : s));
    }, 3000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state !== 'ready') return;
    setState('submitting');

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      toast.error(error.message);
      setState('ready');
      return;
    }

    setState('done');
    toast.success('Password updated. Signing you in…');
    setTimeout(() => {
      router.push('/');
      router.refresh();
    }, 1500);
  }

  if (state === 'invalid') {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-display">Link expired</CardTitle>
          <CardDescription>
            This reset link is invalid or has expired.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link href="/auth/forgot-password" className="text-sm text-primary hover:underline">
            Request a new link
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-display">Set a new password</CardTitle>
        <CardDescription>
          {state === 'waiting'
            ? 'Verifying your link…'
            : state === 'done'
              ? 'Password updated. Redirecting…'
              : 'Choose a password you don’t use anywhere else.'}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              placeholder="At least 12 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={12}
              autoComplete="new-password"
              disabled={state !== 'ready'}
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={state !== 'ready' || password.length < 12}
          >
            {state === 'submitting'
              ? 'Saving…'
              : state === 'done'
                ? 'Done'
                : 'Update password'}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center">
        <Link href="/auth/login" className="text-sm text-muted-foreground hover:text-primary hover:underline">
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
