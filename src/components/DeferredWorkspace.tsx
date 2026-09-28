import { Component, Suspense, type ReactNode } from 'react';
import { Loading } from './ui';

class WorkspaceLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="panel padded" role="alert">
          <h2>Workspace could not be loaded</h2>
          <p>Reload the application to try again. Unsaved edits will be lost.</p>
          <button onClick={() => window.location.reload()}>Reload application</button>
        </section>
      );
    }
    return this.props.children;
  }
}

export function DeferredWorkspace({ children }: { children: ReactNode }) {
  return (
    <WorkspaceLoadBoundary>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </WorkspaceLoadBoundary>
  );
}
