import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import {
  Activity,
  BookOpen,
  Globe,
  LayoutDashboard,
  Server,
  Shield,
  Users,
  Workflow,
} from 'lucide-react';
import { AtlasShell } from './layout/AtlasShell';
import { AccessReview } from './pages/AccessReview';
import { ConfigurationDesk } from './desk/ConfigurationDesk';
import { ReadDesk } from './desk/ReadDesk';
import { request } from './api';
import { ErrorBox, Loading, Modal } from './components/ui';
const ApiWorkbench = lazy(() =>
  import('./desk/ApiWorkbench').then((module) => ({ default: module.ApiWorkbench })),
);
const LogReview = lazy(() =>
  import('./desk/LogReview').then((module) => ({ default: module.LogReview })),
);

const navigation = [
  { id: 'atlas', label: 'Access review', icon: Shield },
  { id: 'permissions', label: 'Account register', icon: Users },
  { id: 'apps', label: 'Application register', icon: Globe },
  { id: 'security', label: 'Security register', icon: Shield },
  { id: 'tasks', label: 'Task register', icon: Workflow },
  { id: 'overview', label: 'Instance status', icon: LayoutDashboard },
  { id: 'system', label: 'Host & devices', icon: Server },
  { id: 'logs', label: 'Logs', icon: Activity },
  { id: 'explorer', label: 'REST workbench', icon: BookOpen },
];
const readPage = () =>
  navigation.some((item) => item.id === location.hash.substring(1))
    ? location.hash.substring(1)
    : 'atlas';
export default function App() {
  const [account, setAccount] = useState<any>(null),
    [checking, setChecking] = useState(true);
  const [page, setPage] = useState(readPage),
    [switcher, showSwitcher] = useState(false);
  const [accountTarget, setAccountTarget] = useState<string>();
  const [theme, setTheme] = useState(localStorage.getItem('atlas-theme') || 'light');
  const [error, setError] = useState(''),
    [leaving, setLeaving] = useState(false);
  useEffect(() => {
    let disposed = false;
    request('session')
      .then((value) => {
        if (!disposed) setAccount(value);
      })
      .catch(() => {})
      .finally(() => {
        if (!disposed) setChecking(false);
      });
    const ended = () => {
      setAccount(null);
      setAccountTarget(undefined);
      setError('');
    };
    const moved = () => setPage(readPage());
    const keys = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        showSwitcher(true);
      }
    };
    window.addEventListener('session-ended', ended);
    window.addEventListener('hashchange', moved);
    window.addEventListener('keydown', keys);
    return () => {
      disposed = true;
      window.removeEventListener('session-ended', ended);
      window.removeEventListener('hashchange', moved);
      window.removeEventListener('keydown', keys);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('atlas-theme', theme);
  }, [theme]);
  const navigate = (id: string) => {
    setAccountTarget(undefined);
    location.hash = id;
    setPage(id);
    showSwitcher(false);
  };
  const inspectAccount = (name: string) => {
    setAccountTarget(name);
    location.hash = 'permissions';
    setPage('permissions');
    showSwitcher(false);
  };
  async function logout() {
    if (leaving) return;
    setLeaving(true);
    setError('');
    try {
      await request('logout', {});
      setAccount(null);
      setAccountTarget(undefined);
    } catch (failure) {
      setError('Sign out could not be confirmed. ' + (failure as Error).message);
    } finally {
      setLeaving(false);
    }
  }
  if (checking) return <Loading />;
  if (!account) return <AtlasSignIn accept={setAccount} />;
  return (
    <div className="access-atlas-app">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to main content
      </a>
      <AtlasShell
        navigation={navigation}
        page={page}
        navigate={navigate}
        username={account.info.username}
        theme={theme}
        onTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        onCommand={() => showSwitcher(true)}
        onLogout={logout}
      >
        {error && <ErrorBox error={error} retry={() => void logout()} />}
        <div hidden={page !== 'atlas'}>
          <AccessReview navigate={navigate} onManageAccount={inspectAccount} />
        </div>
        {['permissions', 'apps', 'security', 'tasks', 'system'].includes(page) && (
          <>
            {page === 'permissions' && accountTarget && (
              <button onClick={() => navigate('atlas')}>Back to access review</button>
            )}
            <ConfigurationDesk
              key={page}
              section={page}
              username={account.info.username}
              initialAccount={page === 'permissions' ? accountTarget : undefined}
            />
          </>
        )}
        {['overview', 'logs', 'explorer'].includes(page) &&
          (page === 'explorer' ? (
            <Suspense fallback={<Loading />}>
              <ApiWorkbench />
            </Suspense>
          ) : page === 'logs' ? (
            <Suspense fallback={<Loading />}>
              <LogReview />
            </Suspense>
          ) : (
            <ReadDesk key={page} kind="overview" />
          ))}
      </AtlasShell>
      {switcher && (
        <Modal title="Find a tool" onClose={() => showSwitcher(false)}>
          <nav className="atlas-switcher">
            {navigation.map((item) => (
              <button key={item.id} onClick={() => navigate(item.id)}>
                {item.label}
              </button>
            ))}
          </nav>
        </Modal>
      )}
    </div>
  );
}
function AtlasSignIn({ accept }: { accept: (session: any) => void }) {
  const [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      fields = new FormData(form);
    setPending(true);
    setError('');
    try {
      const session = await request('login', {
        username: fields.get('username'),
        password: fields.get('password'),
      });
      form.reset();
      accept(session);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="atlas-sign-in">
      <section>
        <span className="eyebrow">InterSystems IRIS</span>
        <h1>Access Atlas</h1>
        <p>Sign in to review access and manage this instance.</p>
        {error && <ErrorBox error={error} />}
        <form onSubmit={(event) => void connect(event)}>
          <fieldset disabled={pending}>
            <label className="field">
              IRIS username
              <input name="username" autoComplete="username" required autoFocus />
            </label>
            <label className="field">
              Password
              <input name="password" autoComplete="current-password" type="password" required />
            </label>
            <button className="primary" type="submit">
              {pending ? 'Checking your account…' : 'Sign in'}
            </button>
          </fieldset>
        </form>
        <p className="muted">Your account permissions apply to every request.</p>
      </section>
    </main>
  );
}
