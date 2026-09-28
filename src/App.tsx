import { lazy, useEffect, useRef, useState, type FormEvent } from 'react';
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
import { request } from './api';
import { ErrorBox, Loading, Modal, ModalBoundary } from './components/ui';
import { DeferredWorkspace } from './components/DeferredWorkspace';
const AccessReview = lazy(() =>
  import('./pages/AccessReview').then((module) => ({ default: module.AccessReview })),
);
const ConfigurationDesk = lazy(() =>
  import('./desk/ConfigurationDesk').then((module) => ({ default: module.ConfigurationDesk })),
);
const ReadDesk = lazy(() =>
  import('./desk/ReadDesk').then((module) => ({ default: module.ReadDesk })),
);
const ApiWorkbench = lazy(() =>
  import('./desk/ApiWorkbench').then((module) => ({ default: module.ApiWorkbench })),
);
const LogReview = lazy(() =>
  import('./desk/LogReview').then((module) => ({ default: module.LogReview })),
);

const navigation = [
  {
    id: 'atlas',
    label: 'Access review',
    icon: Shield,
    keywords: 'campaign certification inheritance simulation sql privileges grants',
  },
  {
    id: 'permissions',
    label: 'Account register',
    icon: Users,
    keywords: 'users roles resources permissions',
  },
  { id: 'apps', label: 'Application register', icon: Globe, keywords: 'web applications routes' },
  {
    id: 'security',
    label: 'Security register',
    icon: Shield,
    keywords: 'wallet secrets certificates tls ssl oauth',
  },
  { id: 'tasks', label: 'Task register', icon: Workflow, keywords: 'tasks schedules jobs' },
  {
    id: 'overview',
    label: 'Instance status',
    icon: LayoutDashboard,
    keywords: 'dashboard monitor health performance telemetry',
  },
  {
    id: 'system',
    label: 'Host & devices',
    icon: Server,
    keywords: 'databases storage processes devices',
  },
  { id: 'logs', label: 'Logs', icon: Activity, keywords: 'messages alerts audit history journals' },
  { id: 'explorer', label: 'REST workbench', icon: BookOpen, keywords: 'api endpoints queries' },
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
          <ModalBoundary suspended={page !== 'atlas'}>
            <DeferredWorkspace>
              <AccessReview navigate={navigate} onManageAccount={inspectAccount} />
            </DeferredWorkspace>
          </ModalBoundary>
        </div>
        {['permissions', 'apps', 'security', 'tasks', 'system'].includes(page) && (
          <>
            {page === 'permissions' && accountTarget && (
              <button onClick={() => navigate('atlas')}>Back to access review</button>
            )}
            <DeferredWorkspace key={page}>
              <ConfigurationDesk
                key={page}
                section={page}
                username={account.info.username}
                initialAccount={page === 'permissions' ? accountTarget : undefined}
              />
            </DeferredWorkspace>
          </>
        )}
        {['overview', 'logs', 'explorer'].includes(page) &&
          (page === 'explorer' ? (
            <DeferredWorkspace key={page}>
              <ApiWorkbench />
            </DeferredWorkspace>
          ) : page === 'logs' ? (
            <DeferredWorkspace key={page}>
              <LogReview />
            </DeferredWorkspace>
          ) : (
            <DeferredWorkspace key={page}>
              <ReadDesk key={page} kind="overview" />
            </DeferredWorkspace>
          ))}
      </AtlasShell>
      {switcher && <ToolFinder navigate={navigate} onClose={() => showSwitcher(false)} />}
    </div>
  );
}
function ToolFinder({
  navigate,
  onClose,
}: {
  navigate: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    search.current?.focus();
  }, []);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = navigation.filter((item) => {
    const text = (item.label + ' ' + item.keywords).toLowerCase();
    return words.every((word) => text.includes(word));
  });
  return (
    <Modal title="Find a tool" onClose={onClose}>
      <label className="field">
        Search tools
        <input
          ref={search}
          autoFocus
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name or keyword, e.g. wallet"
        />
      </label>
      {matches.length ? (
        <nav className="atlas-switcher" aria-label="Matching tools">
          {matches.map((item) => (
            <button key={item.id} onClick={() => navigate(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
      ) : (
        <p role="status">
          No tools match this search. Try a name such as Logs or a keyword such as wallet.
        </p>
      )}
    </Modal>
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
