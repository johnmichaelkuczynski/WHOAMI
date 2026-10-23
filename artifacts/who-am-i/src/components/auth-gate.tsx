import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LoaderCircle, Waves } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

type AuthUser = { email: string; name: string; picture: string | null; development?: boolean };
type AuthContextValue = { user: AuthUser; signOut: () => Promise<void> };
type AuthStatus = 'checking' | 'signed-in' | 'signed-out' | 'error';

const AuthContext = createContext<AuthContextValue | null>(null);
const appBase = import.meta.env.BASE_URL.replace(/\/$/, '');
const apiPath = (path: string) => `${appBase}${path}`;

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthGate.');
  return value;
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  const loadUser = async () => {
    setStatus('checking');
    setError('');
    try {
      const response = await fetch(apiPath('/api/auth/me'), { credentials: 'same-origin', cache: 'no-store' });
      if (response.status === 401) {
        setUser(null);
        setStatus('signed-out');
        return;
      }
      if (!response.ok) throw new Error('The sign-in service could not be reached.');
      setUser(await response.json() as AuthUser);
      setStatus('signed-in');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The sign-in service could not be reached.');
      setStatus('error');
    }
  };

  useEffect(() => {
    void loadUser();
  }, []);

  const signOut = async () => {
    setSigningOut(true);
    setError('');
    try {
      const response = await fetch(apiPath('/api/auth/logout'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Could not end this sign-in session. Try again.');
      queryClient.clear();
      setUser(null);
      setStatus('signed-out');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign out. Try again.');
    } finally {
      setSigningOut(false);
    }
  };

  const context = useMemo(() => user ? ({ user, signOut }) : null, [user, signingOut]);
  const callbackUri = `${window.location.origin}${apiPath('/api/auth/google/callback')}`;

  if (status === 'checking') {
    return <div className="grid min-h-screen place-items-center bg-background text-foreground"><div className="flex items-center gap-3 text-sm text-muted-foreground"><LoaderCircle size={17} className="animate-spin text-primary"/>Checking your sign-in…</div></div>;
  }

  if (status === 'error') {
    return <AuthMessage title="Sign-in is unavailable" message={error} onRetry={() => void loadUser()}/>;
  }

  if (status === 'signed-out' || !user || !context) {
    return <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-[58px] items-center justify-between border-b border-border/80 px-5 md:px-8">
        <div className="text-xs text-muted-foreground">A quieter place to figure out what fits.</div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><span className="size-2 rounded-full bg-[#82a990]"/>Private by design</div>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 items-center px-5 py-12">
        <section className="w-full rounded-2xl border border-border bg-card p-7 shadow-[0_12px_38px_-32px_hsl(218_23%_20%/.35)] md:p-10">
          <span className="mb-6 grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground"><Waves size={21}/></span>
          <p className="mono-label text-[9px] text-primary">YOUR PRIVATE SPACE</p>
          <h1 className="serif-display mt-2 text-[34px] leading-tight">Sign in to continue.</h1>
          <p className="mt-3 text-[13px] leading-6 text-muted-foreground">Use your Google account to keep your reflections, check-ins, and profile connected to you. Each account has its own private data.</p>
          {error && <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
          <a href={apiPath('/api/auth/google')} data-testid="button-google-login" className="mt-6 flex min-h-11 w-full items-center justify-center gap-3 rounded-lg border border-border bg-background px-4 text-[13px] font-semibold transition-colors hover:bg-secondary">
            <span aria-hidden="true" className="font-bold text-[17px] text-[#4285f4]">G</span>
            Continue with Google
          </a>
          <p className="mt-4 text-center text-[10px] leading-5 text-muted-foreground">Google handles your password. This app receives your verified account identity, not your password.</p>
          <details className="mt-6 border-t border-border pt-4">
            <summary className="cursor-pointer text-[10px] text-muted-foreground">Google OAuth redirect URL</summary>
            <p className="mt-2 text-[10px] leading-5 text-muted-foreground">If Google reports a redirect URI mismatch, add this exact address to your OAuth client’s authorized redirect URIs:</p>
            <code className="mt-2 block break-all rounded-md bg-secondary/60 p-2 text-[10px]">{callbackUri}</code>
          </details>
        </section>
      </main>
    </div>;
  }

  return <AuthContext.Provider value={context}>{children}</AuthContext.Provider>;
}

function AuthMessage({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return <div className="grid min-h-screen place-items-center bg-background p-5 text-foreground"><section className="w-full max-w-md rounded-2xl border border-border bg-card p-7"><h1 className="serif-display text-[28px]">{title}</h1><p className="mt-2 text-xs leading-5 text-muted-foreground">{message}</p><button onClick={onRetry} className="mt-5 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground">Try again</button></section></div>;
}
