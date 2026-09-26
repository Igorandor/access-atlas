import type { ReactNode } from 'react';
import { LogOut, Moon, Search, Sun, type LucideIcon } from 'lucide-react';

type Props = {
  page: string;
  navigate: (page: string) => void;
  navigation: Array<{ id: string; label: string; icon: LucideIcon }>;
  username: string;
  theme: string;
  onTheme: () => void;
  onCommand: () => void;
  onLogout: () => Promise<void>;
  children: ReactNode;
};

const sections = [
  { name: 'Review', target: 'atlas', pages: ['atlas'] },
  {
    name: 'Administration',
    target: 'permissions',
    pages: ['permissions', 'apps', 'security', 'tasks'],
  },
  { name: 'Instance', target: 'overview', pages: ['overview', 'system', 'logs', 'explorer'] },
];

export function AtlasShell(props: Props) {
  const section = sections.find((s) => s.pages.includes(props.page)) ?? sections[2];
  return (
    <>
      <header className="atlas-masthead">
        <a className="atlas-wordmark" href="#atlas" onClick={() => props.navigate('atlas')}>
          Access Atlas <span>InterSystems IRIS</span>
        </a>
        <nav aria-label="Main sections">
          {sections.map((s) => (
            <button
              key={s.name}
              aria-current={section === s ? 'page' : undefined}
              onClick={() => props.navigate(s.target)}
            >
              {s.name}
            </button>
          ))}
        </nav>
        <div className="atlas-session">
          <button
            aria-label="Go to workspace"
            title="Go to workspace · Ctrl K"
            onClick={props.onCommand}
          >
            <Search size={17} />
          </button>
          <button
            aria-label={props.theme === 'light' ? 'Use dark theme' : 'Use light theme'}
            onClick={props.onTheme}
          >
            {props.theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
          </button>
          <button
            className="atlas-signout"
            onClick={() => void props.onLogout()}
            aria-label={`Sign out ${props.username}`}
          >
            <span>{props.username}</span>
            <LogOut size={16} />
          </button>
        </div>
      </header>
      {section.pages.length > 1 && (
        <nav className="atlas-section-nav" aria-label={`${section.name} tools`}>
          {section.pages.map((id) => {
            const item = props.navigation.find((n) => n.id === id)!;
            return (
              <button
                key={id}
                aria-current={props.page === id ? 'page' : undefined}
                onClick={() => props.navigate(id)}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      )}
      <main className="atlas-document" id="main-content" tabIndex={-1}>
        {props.children}
      </main>
    </>
  );
}
