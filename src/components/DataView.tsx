import { useMemo, useState } from 'react';
import { download } from '../api';
const ownValue = (record: any, key: string): unknown =>
  record != null && Object.hasOwn(record, key) ? record[key] : undefined;
export const caption = (name: string) =>
  name.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
export function DataValue({ value, level = 0 }: { value: any; level?: number }) {
  if (value === null || value === undefined) return <span className="muted">Not supplied</span>;
  if (typeof value === 'boolean')
    return <span className={value ? 'badge good' : 'badge'}>{value ? 'Yes' : 'No'}</span>;
  if (typeof value !== 'object')
    return <span className="atlas-value">{String(value) || '(empty text)'}</span>;
  const entries = Object.entries(value);
  if (!entries.length)
    return <span className="muted">Empty {Array.isArray(value) ? 'list' : 'record'}</span>;
  if (level >= 5)
    return <span className="muted">Nested record — export to inspect deeper values</span>;
  return (
    <div className="atlas-properties">
      {entries.slice(0, 100).map(([key, item]) =>
        typeof item === 'object' && item !== null ? (
          <ExpandableValue
            key={key}
            name={Array.isArray(value) ? 'Item ' + (Number(key) + 1) : caption(key)}
            value={item}
            level={level + 1}
          />
        ) : (
          <div className="atlas-property" key={key}>
            <strong>{Array.isArray(value) ? 'Item ' + (Number(key) + 1) : caption(key)}</strong>
            <DataValue value={item} level={level + 1} />
          </div>
        ),
      )}
      {entries.length > 100 && (
        <p className="notice">
          Showing 100 of {entries.length} fields/items. The export includes the loaded data.
        </p>
      )}
    </div>
  );
}
function ExpandableValue({ name, value, level }: { name: string; value: any; level: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>{name}</summary>
      {expanded && <DataValue value={value} level={level} />}
    </details>
  );
}
export function DataView({
  data,
  title = 'Data',
  filename = 'atlas-evidence.json',
}: {
  data: any;
  title?: string;
  filename?: string;
  [key: string]: any;
}) {
  const [search, setSearch] = useState(''),
    [selected, select] = useState<number>();
  const rows = Array.isArray(data) ? data : null;
  const matches = useMemo(
    () =>
      rows
        ?.map((row, index) => ({ row, index }))
        .filter(({ row }) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase())) ??
      [],
    [rows, search],
  );
  const keys = useMemo(() => {
    const names = new Set<string>();
    for (const { row } of matches.slice(0, 100))
      if (row && typeof row === 'object' && !Array.isArray(row))
        Object.keys(row)
          .slice(0, 20)
          .forEach((name) => names.add(name));
    return [...names].slice(0, 8);
  }, [matches]);
  return (
    <section className="atlas-evidence" aria-label={title}>
      <div className="section-heading">
        <h3>{title}</h3>
        <button onClick={() => download(filename, rows ? matches.map((item) => item.row) : data)}>
          Export loaded data
        </button>
      </div>
      {rows ? (
        <>
          <label className="atlas-search">
            Find a record
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                select(undefined);
              }}
            />
          </label>
          <p className="muted">{matches.length} matching records; table shows up to 250.</p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Inspect</th>
                  {keys.map((key) => (
                    <th scope="col" key={key}>
                      {caption(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matches.slice(0, 250).map(({ row, index }) => (
                  <tr key={index}>
                    <td>
                      <button onClick={() => select(index)}>Record {index + 1}</button>
                    </td>
                    {keys.map((key) => {
                      const value = ownValue(row, key);
                      return (
                        <td key={key}>
                          {value && typeof value === 'object' ? (
                            <span>
                              {Array.isArray(value) ? value.length + ' items' : 'Nested fields'}
                            </span>
                          ) : (
                            <DataValue value={value} />
                          )}
                        </td>
                      );
                    })}
                    {!keys.length && (
                      <td>
                        <DataValue value={row} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!matches.length && <p className="empty">No matching records.</p>}
          {selected !== undefined && (
            <aside className="atlas-inspector">
              <div className="section-heading">
                <h3>Record {selected + 1}</h3>
                <button onClick={() => select(undefined)}>Close record</button>
              </div>
              <DataValue value={rows[selected]} />
            </aside>
          )}
        </>
      ) : (
        <DataValue value={data} />
      )}
    </section>
  );
}
export function DataDiff({
  before,
  after,
  beforeLabel = 'Baseline',
  afterLabel = 'Current',
}: {
  before: any;
  after: any;
  beforeLabel?: string;
  afterLabel?: string;
}) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>{beforeLabel}</th>
            <th>{afterLabel}</th>
          </tr>
        </thead>
        <tbody>
          {keys
            .filter(
              (key) =>
                JSON.stringify(ownValue(before, key)) !== JSON.stringify(ownValue(after, key)),
            )
            .map((key) => (
              <tr key={key}>
                <th scope="row">{caption(key)}</th>
                <td>
                  <DataValue value={ownValue(before, key)} />
                </td>
                <td>
                  <DataValue value={ownValue(after, key)} />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
