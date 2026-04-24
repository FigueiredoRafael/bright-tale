'use client';

/**
 * Forgot password — user-facing app.
 *
 * UX: always show the same success message regardless of whether the
 * email is registered. Side-channel equivalent to the admin
 * /admin/forgot-password flow in apps/web. The Supabase call never
 * throws for unknown identities (by design) — we still wrap the call
 * so any transient error also returns the same uniform result.
 *
 * Rate limiting here is client-side + Supabase's own server-side
 * throttle (default ~1 email/60s per identity). Do NOT add
 * enumeration-leaky error messages.
 */

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    // Supabase resetPasswordForEmail does NOT throw for unknown emails;
    // it silently no-ops. We still guard against transient network
    // errors and show the same success UI either way.
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
    } catch {
      // swallow — uniform response prevents enumeration
    }

    setSubmitted(true);
    setLoading(false);
  }

  if (submitted) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-display">Check your inbox</CardTitle>
          <CardDescription>
            If this email is registered, we&apos;ve sent a link to reset your password.
            It expires in 10 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-3">
          <p>
            Didn&apos;t get it? Check your spam folder, wait 60 seconds and
            try again, or contact us at{' '}
            <a href="mailto:support@brighttale.com.br" className="text-primary hover:underline">
              support@brighttale.com.br
            </a>.
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <Link href="/auth/login" className="text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-display">Forgot your password?</CardTitle>
        <CardDescription>
          Enter the email on your account and we&apos;ll send a reset link.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Sending…' : 'Send reset link'}
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
