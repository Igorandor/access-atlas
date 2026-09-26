import { useEffect, useRef, useState } from 'react';
import { register, type RegisterEntry } from '../../shared/register';
import { bodySchema, parameters, spec } from '../../shared/schema';
import { taskDefaults } from '../../shared/task-defaults';
import { redact } from '../../shared/redaction';
import { iris } from '../api';
import { useData } from '../hooks';
import { DataDiff, DataValue, caption } from '../components/DataView';
import { ErrorBox, Loading, PageHeader } from '../components/ui';
import { TypedProposal, initialValue } from './TypedProposal';

type Proposal = {
  title: string;
  path: string;
  method: 'PUT' | 'POST' | 'DELETE';
  query: Record<string, string>;
  body: Record<string, any>;
  baseline?: Record<string, any>;
  destructive: boolean;
  editing: boolean;
};

export function ConfigurationDesk({ section, username }: { section: string; username: string }) {
  const choices = register.filter((item) => item.section === section);
  const [selected, setSelected] = useState(choices[0].key);
  const entry = choices.find((item) => item.key === selected) ?? choices[0];
  return (
    <>
      <PageHeader
        title="Configuration register"
        description="Inspect an object, select the fields to change, and review a proposal before applying it."
      />
      <div className="atlas-register-tabs" aria-label="Configuration registers">
        {choices.map((item) => (
          <button
            key={item.key}
            aria-pressed={item.key === entry.key}
            onClick={() => setSelected(item.key)}
          >
            {item.title}
          </button>
        ))}
      </div>
      <Register key={entry.key} entry={entry} username={username} />
    </>
  );
}

function Register({ entry, username }: { entry: RegisterEntry; username: string }) {
  const scopes = useData<any[]>(entry.scope?.list ?? '');
  const [scope, setScope] = useState(''),
    [filter, setFilter] = useState('');
  const [query, setQuery] = useState<Record<string, string>>({});
  const selectedScope = scope || String(scopes.data?.[0]?.[entry.scope?.identity ?? ''] ?? '');
  const listQuery = {
    ...query,
    ...(entry.scope && selectedScope ? { [entry.scope.parameter]: selectedScope } : {}),
  };
  const inventory = useData<any[]>(!entry.scope || selectedScope ? entry.list : '', listQuery);
  const [record, setRecord] = useState<any>(),
    [identity, setIdentity] = useState('');
  const [proposal, setProposal] = useState<Proposal>(),
    [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [execution, setExecution] = useState<any>();
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    generation.current++;
    setRecord(undefined);
    setProposal(undefined);
    setIdentity('');
  }, [selectedScope]);
  const rows = (Array.isArray(inventory.data) ? inventory.data : []).filter((row) =>
    JSON.stringify(row).toLowerCase().includes(filter.toLowerCase()),
  );
  const keyQuery = (id: string): Record<string, string> => ({
    ...(entry.parameter ? { [entry.parameter]: id } : {}),
    ...(entry.key === 'secrets' ? { collection: selectedScope } : {}),
  });
  const resetProposal = (next: Proposal) => {
    setProposal(next);
    setReview(false);
    setConfirmation('');
    setError('');
    setNotice('');
  };

  async function inspect(row: any) {
    const version = ++generation.current,
      id = String(row[entry.identity]);
    setBusy(true);
    setError('');
    setProposal(undefined);
    setRecord(undefined);
    setIdentity(id);
    setExecution(undefined);
    try {
      const data =
        entry.record && !entry.opaque ? (await iris(entry.record, keyQuery(id))).data : row;
      const taskState =
        entry.key === 'tasks' ? (await iris('/v2/task/info', { id })).data : undefined;
      if (generation.current === version) {
        setRecord(entry.key === 'processes' ? { ...row, ...data } : data);
        setExecution(taskState);
      }
    } catch (failure) {
      if (generation.current === version) setError((failure as Error).message);
    } finally {
      if (generation.current === version) setBusy(false);
    }
  }

  function draft(create: boolean) {
    const method = create ? entry.create! : 'PUT';
    const schema = bodySchema(entry.record!, method);
    let body = create ? initialValue(schema) : {};
    if (create && entry.key === 'tasks') body = taskDefaults(username);
    if (create && entry.key === 'users')
      body = { User: { Enabled: true, ChangePassword: true, Roles: [] }, Password: '' };
    if (create && entry.key === 'oauthClients') body.OAuth2ServerDefinition = selectedScope;
    if (entry.key === 'secrets')
      body = {
        Type: '%Wallet.KeyValue',
        WalletSecretConfig: { AllowedHosts: [], RequireTLS: true, Usage: ['HTTP'], Secret: {} },
      };
    resetProposal({
      title: create ? 'New ' + entry.title.toLowerCase() : 'Change selected fields',
      path: entry.record!,
      method,
      query: create
        ? entry.key === 'secrets'
          ? { collection: selectedScope }
          : {}
        : keyQuery(identity),
      body,
      baseline: create ? undefined : record,
      destructive: false,
      editing: !create,
    });
  }

  function action(
    path: string,
    title: string,
    method: 'POST' | 'DELETE' = 'POST',
    body: Record<string, any> = {},
  ) {
    resetProposal({
      title,
      path,
      method,
      query: keyQuery(identity),
      body,
      destructive: true,
      editing: false,
    });
  }

  async function apply() {
    if (!proposal) return;
    const current = proposal,
      version = generation.current;
    setBusy(true);
    setError('');
    try {
      if (current.editing && !entry.opaque) {
        const fresh = (await iris(entry.record!, keyQuery(identity))).data;
        for (const key of Object.keys(current.body))
          if (JSON.stringify(fresh[key]) !== JSON.stringify(current.baseline?.[key]))
            throw new Error(
              'The field ' +
                caption(key) +
                ' changed after inspection. Cancel the proposal and inspect again.',
            );
      }
      const outcome = await iris(
        current.path,
        current.query,
        current.method,
        current.method === 'DELETE' ? undefined : current.body,
      );
      if (version !== generation.current) return;
      setNotice('Proposal applied. Refresh the access capture to compare configuration evidence.');
      setProposal(undefined);
      setRecord(undefined);
      setIdentity('');
      inventory.refresh();
      if (outcome.console.length)
        setNotice('Proposal applied. ' + outcome.console.join(' ').slice(0, 2000));
    } catch (failure) {
      if (version === generation.current) setError((failure as Error).message);
    } finally {
      if (version === generation.current) setBusy(false);
    }
  }

  const proposalParameters = proposal ? parameters(proposal.path, proposal.method) : [];
  const validParameters = !proposalParameters.some(
    (field) => field.required && !proposal?.query[field.name]?.trim(),
  );
  return (
    <section className="atlas-register">
      <div className="atlas-register-toolbar">
        {entry.scope && (
          <label className="field">
            {entry.scope.label}
            <select
              disabled={busy}
              value={selectedScope}
              onChange={(event) => setScope(event.target.value)}
            >
              <option value="">Select a scope</option>
              {scopes.data?.map((item) => (
                <option key={item[entry.scope!.identity]} value={item[entry.scope!.identity]}>
                  {item.IssuerEndpoint ?? item[entry.scope!.identity]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          Find in loaded records
          <input value={filter} onChange={(event) => setFilter(event.target.value)} />
        </label>
        {parameters(entry.list).some((field) => field.name === 'filter') && (
          <label className="field">
            Native filter
            <input
              disabled={busy}
              value={query.filter ?? ''}
              onChange={(event) => {
                setRecord(undefined);
                setIdentity('');
                setProposal(undefined);
                setQuery(event.target.value ? { filter: event.target.value } : {});
              }}
            />
          </label>
        )}
        <button disabled={busy || inventory.loading} onClick={inventory.refresh}>
          Reload register
        </button>
        {entry.create && (
          <button
            className="primary"
            disabled={busy || (!!entry.scope && !selectedScope)}
            onClick={() => draft(true)}
          >
            Propose a new record
          </button>
        )}
      </div>
      {(error || inventory.error || scopes.error) && (
        <ErrorBox error={error || inventory.error || scopes.error} />
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className="atlas-register-layout">
        <nav className="atlas-record-index" aria-label={entry.title}>
          <p>{rows.length} loaded records · at most 250 per read</p>
          {inventory.loading && <Loading />}
          {rows.map((row, index) => (
            <button
              key={String(row[entry.identity]) + index}
              disabled={busy}
              aria-current={identity === String(row[entry.identity]) ? 'true' : undefined}
              onClick={() => void inspect(row)}
            >
              <strong>
                {row.Name ?? row.ApplicationName ?? row.IssuerEndpoint ?? row[entry.identity]}
              </strong>
              <small>{row.Description ?? row.FullName ?? row.State ?? row.Type ?? ''}</small>
            </button>
          ))}
          {!inventory.loading && !rows.length && <p>No records in this scope.</p>}
        </nav>
        <div className="atlas-record-body">
          {busy && <Loading />}
          {record && (
            <>
              <div className="section-heading">
                <h2>{identity}</h2>
                <div className="inline-actions">
                  {entry.create && (
                    <button disabled={busy} onClick={() => draft(false)}>
                      Propose changes
                    </button>
                  )}
                  {entry.create && spec.paths[entry.record!]?.delete && (
                    <button
                      disabled={busy}
                      onClick={() => action(entry.record!, 'Delete record', 'DELETE')}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
              <DataValue value={record} />
              {execution && (
                <section>
                  <h3>Native task execution state</h3>
                  <DataValue value={execution} />
                </section>
              )}
              {['tasks', 'processes'].includes(entry.key) && (
                <div className="inline-actions">
                  {(entry.key === 'tasks'
                    ? ['run', 'suspend', 'resume']
                    : ['suspend', 'resume', 'terminate']
                  ).map((command) => (
                    <button
                      key={command}
                      disabled={
                        busy ||
                        (entry.key === 'processes' &&
                          command !== 'resume' &&
                          record[command === 'terminate' ? 'CanBeTerminated' : 'CanBeSuspended'] !==
                            true)
                      }
                      onClick={() =>
                        action(
                          '/v2/' + (entry.key === 'tasks' ? 'task/' : 'process/') + command,
                          caption(command),
                          'POST',
                          entry.key === 'tasks' && command === 'run'
                            ? { RunNow: true }
                            : entry.key === 'tasks' && command === 'suspend'
                              ? { LeaveInQueue: true }
                              : {},
                        )
                      }
                    >
                      {caption(command)}
                    </button>
                  ))}
                </div>
              )}
              {entry.key === 'users' && (
                <button
                  disabled={busy}
                  onClick={() =>
                    action('/v2/security/user/password', 'Reset account password', 'POST', {
                      Password: '',
                    })
                  }
                >
                  Reset password
                </button>
              )}
              {entry.key === 'oauthClients' && (
                <button
                  disabled={busy}
                  onClick={() =>
                    action(entry.record! + '/secrets', 'Update OAuth credentials', 'POST', {})
                  }
                >
                  Update client credentials
                </button>
              )}
            </>
          )}
          {!record && !proposal && !busy && (
            <div className="empty">
              <h2>Inspect before changing</h2>
              <p>Select an object in the register, or propose a new record.</p>
            </div>
          )}
          {proposal && (
            <section className="atlas-proposal">
              <h2>{proposal.title}</h2>
              <p className="muted">Only fields included in this proposal are sent to IRIS.</p>
              {review ? (
                <>
                  <DataDiff
                    before={redact(
                      Object.fromEntries(
                        Object.keys(proposal.body).map((key) => [key, proposal.baseline?.[key]]),
                      ),
                    )}
                    after={redact(proposal.body)}
                  />
                  <p>
                    Target:{' '}
                    <strong>
                      {Object.values(proposal.query).join(' · ') ||
                        proposal.body.Name ||
                        'New record'}
                    </strong>
                  </p>
                  {proposal.destructive && (
                    <label className="field">
                      Type {identity} to confirm
                      <input
                        autoComplete="off"
                        value={confirmation}
                        onChange={(event) => setConfirmation(event.target.value)}
                      />
                    </label>
                  )}
                  <div className="inline-actions">
                    <button disabled={busy} onClick={() => setReview(false)}>
                      Revise proposal
                    </button>
                    <button
                      className="primary"
                      disabled={busy || (proposal.destructive && confirmation !== identity)}
                      onClick={() => void apply()}
                    >
                      Apply reviewed proposal
                    </button>
                  </div>
                </>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    setReview(true);
                  }}
                >
                  <fieldset disabled={busy}>
                    {proposalParameters.map((field) => (
                      <label className="field" key={field.name}>
                        {caption(field.name)}
                        {field.required ? ' *' : ''}
                        <input
                          required={field.required}
                          value={proposal.query[field.name] ?? ''}
                          readOnly={proposal.editing || proposal.destructive}
                          onChange={(event) =>
                            setProposal({
                              ...proposal,
                              query: { ...proposal.query, [field.name]: event.target.value },
                            })
                          }
                        />
                      </label>
                    ))}
                    {proposal.method !== 'DELETE' && (
                      <TypedProposal
                        schema={bodySchema(proposal.path, proposal.method)}
                        value={proposal.body}
                        previous={proposal.baseline}
                        onChange={(body) => setProposal({ ...proposal, body })}
                      />
                    )}
                    <button
                      type="submit"
                      disabled={
                        !validParameters ||
                        (proposal.method !== 'DELETE' &&
                          !Object.keys(proposal.body).length &&
                          !!bodySchema(proposal.path, proposal.method).properties)
                      }
                    >
                      Review proposal
                    </button>
                  </fieldset>
                </form>
              )}
              <button disabled={busy} onClick={() => setProposal(undefined)}>
                Discard proposal
              </button>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
