'use client';

import { Suspense, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { adminPath } from '@/lib/admin-path';

function LoginFallback() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[var(--bg-deep)] flex items-center justify-center">
      <div className="bg-white dark:bg-[var(--bg-surface)] p-8 rounded-xl max-w-md w-full shadow-xl border border-slate-200 dark:border-[var(--color-dash-border)]">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-[var(--color-v-primary)]">BrightTale</h1>
          <p className="text-sm text-slate-500 dark:text-[var(--color-v-secondary)] mt-1">Acesso restrito</p>
        </div>
        <div className="space-y-4">
          <div className="h-10 bg-slate-100 dark:bg-[var(--bg-card)] rounded-lg animate-pulse" />
          <div className="h-10 bg-slate-100 dark:bg-[var(--bg-card)] rounded-lg animate-pulse" />
          <div className="h-10 bg-slate-200 dark:bg-[var(--bg-card)] rounded-lg animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <AdminLoginForm />
    </Suspense>
  );
}

function AdminLoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();

  const authError = searchParams.get('error');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError('Email ou senha inválidos');
      setLoading(false);
      return;
    }

    router.push(adminPath());
    router.refresh();
  }

  const displayError =
    error ||
    (authError === 'unauthorized' ? 'Acesso restrito. Conta sem permissão de administrador.' : '');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[var(--bg-deep)] flex items-center justify-center transition-colors">
      <div className="bg-white dark:bg-[var(--bg-surface)] p-8 rounded-xl max-w-md w-full shadow-xl border border-slate-200 dark:border-[var(--color-dash-border)]">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-[var(--color-v-primary)]">BrightTale</h1>
          <p className="text-sm text-slate-500 dark:text-[var(--color-v-secondary)] mt-1">Acesso restrito</p>
        </div>

        {displayError && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-[var(--color-v-red)] p-3 rounded-lg mb-4 text-sm border border-red-200 dark:border-red-800/30">
            {displayError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-slate-300 dark:border-[var(--color-dash-border)] bg-white dark:bg-[var(--bg-card)] rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent outline-none text-sm text-slate-900 dark:text-[var(--color-v-primary)] placeholder:text-slate-400 dark:placeholder:text-[var(--color-v-dim)]"
            placeholder="Email"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-slate-300 dark:border-[var(--color-dash-border)] bg-white dark:bg-[var(--bg-card)] rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent outline-none text-sm text-slate-900 dark:text-[var(--color-v-primary)] placeholder:text-slate-400 dark:placeholder:text-[var(--color-v-dim)]"
            placeholder="Senha"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white py-2.5 rounded-lg font-semibold text-sm transition"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
