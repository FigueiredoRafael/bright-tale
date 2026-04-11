'use client';

import { Suspense, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';

export default function AdminLoginPage() {
  return (
    <Suspense>
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

    router.push('/admin');
    router.refresh();
  }

  const displayError =
    error ||
    (authError === 'unauthorized' ? 'Acesso restrito. Conta sem permissão de administrador.' : '');

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-white p-8 rounded-xl max-w-md w-full shadow-xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">BrightTale Admin</h1>
          <p className="text-sm text-gray-500 mt-1">Acesso restrito</p>
        </div>

        {displayError && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">
            {displayError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none text-sm"
            placeholder="Email"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none text-sm"
            placeholder="Senha"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white py-2.5 rounded-lg font-semibold text-sm transition"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
