'use client';

import { Suspense, useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

/**
 * Login page — replaces the client-side password gate that lived in
 * app/admin/page.tsx. Now the actual password verification happens
 * server-side via NextAuth Credentials provider against the AdminUser
 * table (bcrypt-hashed passwords). The hardcoded `zone2026` constant
 * is gone — see R1 fix in the analysis report.
 *
 * After successful login, redirect to /admin (or whatever callbackUrl
 * the middleware set).
 *
 * Note: useSearchParams() must be wrapped in <Suspense> per Next.js 16
 * static generation requirement.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <div className="zone-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
        ЗАГРУЗКА...
      </div>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') || '/admin';
  const hadError = params.get('error') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(hadError);

  useEffect(() => {
    if (hadError) setError(true);
  }, [hadError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(false);

    const result = await signIn('credentials', {
      email: email.toLowerCase().trim(),
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError(true);
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  };

  return (
    <div className="zone-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        padding: '24px 20px',
        maxWidth: 320,
        width: '100%',
        textAlign: 'center',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          color: 'var(--text-bright)',
          letterSpacing: '0.2em',
          marginBottom: 4,
        }}>
          ВХОД В АДМИН
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: 'var(--text-dim)',
          letterSpacing: '0.15em',
          marginBottom: 16,
        }}>
          LAST HOPE · ЗОНА
        </div>
        <div style={{ width: 40, height: 1, background: 'var(--blood)', margin: '0 auto 16px', opacity: 0.6 }} />

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(false); }}
            placeholder="EMAIL"
            autoFocus
            required
            className="s-input"
            style={{ width: '100%', textAlign: 'center' }}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(false); }}
            placeholder="ПАРОЛЬ"
            required
            className="s-input"
            style={{ width: '100%', textAlign: 'center' }}
          />
          {error && (
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--danger)',
              letterSpacing: '0.1em',
              padding: '4px 0',
            }}>
              НЕВЕРНЫЙ EMAIL ИЛИ ПАРОЛЬ
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="s-btn"
            style={{ width: '100%', opacity: loading ? 0.6 : 1 }}
          >
            {loading ? '⏳ ПРОВЕРКА...' : '→ ВОЙТИ'}
          </button>
        </form>

        <div style={{ marginTop: 16 }}>
          <Link href="/" style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--text-dim)',
            letterSpacing: '0.1em',
            textDecoration: 'none',
            borderBottom: '1px solid rgba(255,255,255,0.15)',
          }}>
            ← НАЗАД К КАРТЕ
          </Link>
        </div>
      </div>
    </div>
  );
}
