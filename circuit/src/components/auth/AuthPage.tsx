'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { Cpu, Loader2, Lock, LogIn, Mail, UserPlus } from 'lucide-react';
import { serverApiUrl } from '@cs/lib/server-api';

const AUTH_TOKEN_KEY = 'circuit-studio-auth-token';
const AUTH_USER_KEY = 'circuit-studio-auth-user';

type AuthMode = 'login' | 'register';

type AuthResponse = {
  ok?: boolean;
  error?: string;
  token?: string;
  user?: unknown;
};

export function AuthPage({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const isRegister = mode === 'register';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) router.replace('/');
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setError('');
    setLoading(true);

    try {
      const response = await fetch(serverApiUrl(isRegister ? '/auth/register' : '/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isRegister ? { name, email, password } : { email, password }),
      });
      const data = (await response.json().catch(() => null)) as AuthResponse | null;

      if (!response.ok || !data?.token || !data.user) {
        throw new Error(data?.error ?? 'Authentication failed.');
      }

      window.localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
      window.location.href = '/';
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#eef3f7] text-[#101828]">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <section className="flex min-h-[320px] items-center justify-center bg-[#006aa0] px-8 py-10 text-white">
          <div className="max-w-[560px]">
            <div className="mb-7 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-white/15">
                <Cpu size={25} />
              </span>
              <span className="text-3xl font-black">Circuit Studio</span>
            </div>
            <h1 className="text-[44px] font-black leading-[1.08] tracking-[0]">
              Build, simulate, and teach circuits from one workspace.
            </h1>
            <p className="mt-5 max-w-[500px] text-base font-semibold leading-7 text-[#d8edf8]">
              Sign in to manage classes, projects, quizzes, guides, and your saved circuit work.
            </p>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-10">
          <div className="w-full max-w-[430px] rounded-lg border border-[#d8e3ec] bg-white p-6 shadow-sm">
            <div className="mb-6">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#e9f5fb] px-3 py-1 text-xs font-black uppercase text-[#006aa0]">
                {isRegister ? <UserPlus size={15} /> : <LogIn size={15} />}
                {isRegister ? 'Create account' : 'Welcome back'}
              </div>
              <h2 className="text-3xl font-black tracking-[0] text-[#101828]">
                {isRegister ? 'Register' : 'Login'}
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#667789]">
                {isRegister
                  ? 'Create your account with a valid email and secure password.'
                  : 'Use your registered email and password to continue.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegister ? (
                <div>
                  <label className="mb-2 block text-xs font-black uppercase text-[#526070]">Name</label>
                  <div className="flex h-11 items-center rounded-md border border-[#cfdbe6] bg-[#fbfdfe] px-3 focus-within:border-[#006aa0] focus-within:ring-2 focus-within:ring-[#d7ebf6]">
                    <UserPlus size={17} className="text-[#667789]" />
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="ml-2 w-full bg-transparent text-sm font-semibold outline-none"
                      placeholder="Your name"
                      autoComplete="name"
                    />
                  </div>
                </div>
              ) : null}

              <div>
                <label className="mb-2 block text-xs font-black uppercase text-[#526070]">Email</label>
                <div className="flex h-11 items-center rounded-md border border-[#cfdbe6] bg-[#fbfdfe] px-3 focus-within:border-[#006aa0] focus-within:ring-2 focus-within:ring-[#d7ebf6]">
                  <Mail size={17} className="text-[#667789]" />
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="ml-2 w-full bg-transparent text-sm font-semibold outline-none"
                    placeholder="you@example.com"
                    autoComplete="email"
                    type="email"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-black uppercase text-[#526070]">Password</label>
                <div className="flex h-11 items-center rounded-md border border-[#cfdbe6] bg-[#fbfdfe] px-3 focus-within:border-[#006aa0] focus-within:ring-2 focus-within:ring-[#d7ebf6]">
                  <Lock size={17} className="text-[#667789]" />
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="ml-2 w-full bg-transparent text-sm font-semibold outline-none"
                    placeholder={isRegister ? 'At least 8 chars, letter and number' : 'Password'}
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    type="password"
                  />
                </div>
              </div>

              {error ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#006aa0] text-sm font-black text-white transition hover:bg-[#005a8a] disabled:bg-[#9aa8b4]"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : isRegister ? <UserPlus size={18} /> : <LogIn size={18} />}
                {loading ? 'Please wait...' : isRegister ? 'Create account' : 'Login'}
              </button>
            </form>

            {isRegister ? null : (
              <div className="mt-5 text-center text-sm font-semibold text-[#526070]">
                Login with your assigned account or redirected access token.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
