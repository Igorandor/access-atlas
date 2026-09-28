import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
const ModalSuspension = createContext(false);
export function ModalBoundary({
  suspended,
  children,
}: {
  suspended: boolean;
  children: ReactNode;
}) {
  return <ModalSuspension.Provider value={suspended}>{children}</ModalSuspension.Provider>;
}

export const Badge = ({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) => (
  <span className={`badge ${tone}`}>{children}</span>
);
export const Loading = () => (
  <p className="loading" role="status">
    Loading…
  </p>
);
export function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <aside className="error-box" role="alert">
      <strong>Request not completed</strong>
      <p>{error}</p>
      {retry && <button onClick={retry}>Retry this request</button>}
    </aside>
  );
}
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="header-actions">{children}</div>
    </header>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const suspended = useContext(ModalSuspension);
  const element = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (suspended) return;
    opener.current = document.activeElement as HTMLElement;
    element.current?.showModal();
    return () => {
      element.current?.close();
      opener.current?.focus();
    };
  }, [suspended]);
  return (
    <dialog
      ref={element}
      hidden={suspended}
      className={wide ? 'modal wide' : 'modal'}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close dialog">
          Close
        </button>
      </header>
      {subtitle && <p className="muted">{subtitle}</p>}
      {children}
    </dialog>
  );
}
