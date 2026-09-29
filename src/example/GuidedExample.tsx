import { useState } from 'react';
import { AccessMap } from '../features/access/AccessMap';
import { ResourceMatrix } from '../features/access/ResourceMatrix';
import { trainingSnapshot } from './training-snapshot';
import { ReviewOutcome } from './ReviewOutcome';

export function GuidedExample() {
  const [view, setView] = useState<'map' | 'matrix' | 'outcome'>('map');
  return (
    <main className="access-atlas-app guided-example">
      <header className="example-header">
        <p className="example-label">
          Interactive example · Synthetic training data · No IRIS connection
        </p>
        <h1>Access Atlas</h1>
        <p>Would removing a support role also remove an account’s read access?</p>
        <a href="https://github.com/Igorandor/access-atlas">
          Install Access Atlas and review your own instance
        </a>
      </header>
      <details className="example-guide" open>
        <summary>Role-change walkthrough</summary>
        <ol>
          <li>In Access map, expand TrainingOrders to see where alex.training gets R and W.</li>
          <li>
            Uncheck SupportTeam. W disappears, but ReportingReader still supplies R. Reset the
            preview.
          </li>
          <li>
            Open Resource matrix. Explain the RW cell, then compare TrainingStatus’s public R with
            the account’s dash.
          </li>
          <li>
            Open Review outcome to compare supplied before/after captures and download a training
            report with the remaining follow-up.
          </li>
        </ol>
        <p>
          The preview changes only Access map. Resource matrix always shows the original training
          capture. Public permissions are separate from assigned roles.
        </p>
      </details>
      <nav className="atlas-tabs" aria-label="Example views">
        <button
          className={view === 'map' ? 'active' : ''}
          aria-current={view === 'map' ? 'page' : undefined}
          onClick={() => setView('map')}
        >
          Access map
        </button>
        <button
          className={view === 'matrix' ? 'active' : ''}
          aria-current={view === 'matrix' ? 'page' : undefined}
          onClick={() => setView('matrix')}
        >
          Resource matrix
        </button>
        <button
          className={view === 'outcome' ? 'active' : ''}
          aria-current={view === 'outcome' ? 'page' : undefined}
          onClick={() => setView('outcome')}
        >
          Review outcome
        </button>
      </nav>
      {view === 'map' ? (
        <AccessMap snapshot={trainingSnapshot} />
      ) : view === 'matrix' ? (
        <>
          <p className="example-scroll-hint">Scroll horizontally to read all columns.</p>
          <ResourceMatrix snapshot={trainingSnapshot} initialResourceSearch="Training" />
        </>
      ) : (
        <ReviewOutcome />
      )}
      <footer className="example-limits">
        <p>
          These are declared configuration paths, not a runtime authorization test. Application
          roles, escalation, SQL privileges and row policies are outside this example. IRIS remains
          authoritative.
        </p>
        <p>
          The training report is a downloadable exercise, not a saved campaign or live change
          receipt. The connected application stores campaigns and reviewed-change records on its
          gateway.
        </p>
        <p>
          <a href="./THIRD_PARTY_LICENSES.txt">Licenses</a>
        </p>
      </footer>
    </main>
  );
}
