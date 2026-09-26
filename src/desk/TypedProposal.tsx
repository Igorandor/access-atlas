import { useId, useState } from 'react';
import { plainDescription, resolveSchema, type Schema } from '../../shared/schema';
import { caption } from '../components/DataView';

export function initialValue(input: Schema): any {
  const schema = resolveSchema(input);
  if (schema.default !== undefined) return structuredClone(schema.default);
  if (schema.type === 'boolean') return false;
  if (schema.type === 'array') return [];
  if (schema.type === 'object' || schema.properties) {
    const value: Record<string, unknown> = {};
    for (const name of schema.required ?? [])
      if (schema.properties?.[name]) value[name] = initialValue(schema.properties[name]);
    return value;
  }
  return schema.type === 'number' || schema.type === 'integer' ? 0 : '';
}

/** A proposal includes only explicitly selected fields. Unselected native values stay untouched. */
export function TypedProposal({
  schema: source,
  value,
  onChange,
  name = 'Fields',
  depth = 0,
  secret = false,
  previous,
}: {
  schema: Schema;
  value: any;
  onChange: (value: any) => void;
  name?: string;
  depth?: number;
  secret?: boolean;
  previous?: any;
}) {
  const id = useId(),
    [newKey, setNewKey] = useState('');
  const schema = resolveSchema(source);
  const protectedValue =
    secret || /password|token|secret|private.?key/i.test(name) || schema.writeOnly;
  if (depth > 8) return <p className="notice">This proposal is limited to eight nested levels.</p>;
  if (schema.enum)
    return (
      <label className="field" htmlFor={id}>
        {caption(name)}
        <select
          id={id}
          value={String(value ?? '')}
          onChange={(event) =>
            onChange(schema.enum!.find((item) => String(item) === event.target.value))
          }
        >
          <option value="">Choose a value</option>
          {schema.enum.map((item, index) => (
            <option key={index} value={String(item)}>
              {String(item)}
            </option>
          ))}
        </select>
      </label>
    );
  if (schema.type === 'boolean')
    return (
      <label className="atlas-check" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        {caption(name)}
      </label>
    );
  if (schema.type === 'array') {
    const items = Array.isArray(value) ? value : [];
    return (
      <fieldset className="atlas-fieldset">
        <legend>
          {caption(name)} · {items.length} items
        </legend>
        {items.slice(0, 200).map((item, index) => (
          <div className="atlas-array-item" key={index}>
            <TypedProposal
              schema={schema.items ?? { type: 'string' }}
              value={item}
              name={'Item ' + (index + 1)}
              depth={depth + 1}
              secret={!!protectedValue}
              onChange={(next) =>
                onChange(items.map((old, position) => (position === index ? next : old)))
              }
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, position) => position !== index))}
            >
              Remove item {index + 1}
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={items.length >= 200}
          onClick={() => onChange([...items, initialValue(schema.items ?? { type: 'string' })])}
        >
          Add item
        </button>
      </fieldset>
    );
  }
  if (schema.type === 'object' || schema.properties || (value && typeof value === 'object')) {
    const object = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const definitions = schema.properties ?? {};
    const names = [...new Set([...Object.keys(definitions), ...Object.keys(object)])].filter(
      (key) => !definitions[key]?.readOnly,
    );
    const set = (key: string, next: any) => onChange({ ...object, [key]: next });
    const remove = (key: string) => {
      const next = { ...object };
      delete next[key];
      onChange(next);
    };
    return (
      <fieldset className="atlas-fieldset">
        <legend>{caption(name)}</legend>
        {names.map((key) => (
          <div className="atlas-proposed-field" key={key}>
            <label className="atlas-check">
              <input
                type="checkbox"
                checked={Object.hasOwn(object, key)}
                onChange={(event) =>
                  event.target.checked
                    ? set(
                        key,
                        previous &&
                          Object.hasOwn(previous, key) &&
                          !JSON.stringify(previous[key]).includes('[redacted]')
                          ? structuredClone(previous[key])
                          : initialValue(definitions[key] ?? { type: 'string' }),
                      )
                    : remove(key)
                }
              />
              Include {caption(key)}
            </label>
            {Object.hasOwn(object, key) && (
              <TypedProposal
                name={key}
                schema={
                  definitions[key] ?? {
                    type: typeof object[key] === 'object' ? 'object' : 'string',
                  }
                }
                value={object[key]}
                previous={previous?.[key]}
                onChange={(next) => set(key, next)}
                depth={depth + 1}
                secret={!!protectedValue}
              />
            )}
          </div>
        ))}
        {(!schema.properties || schema.additionalProperties) && (
          <div className="inline-actions">
            <input
              aria-label={'New field in ' + name}
              value={newKey}
              maxLength={128}
              onChange={(event) => setNewKey(event.target.value)}
              placeholder="New field name"
            />
            <button
              type="button"
              disabled={
                !newKey.trim() ||
                ['__proto__', 'prototype', 'constructor'].includes(newKey) ||
                Object.hasOwn(object, newKey)
              }
              onClick={() => {
                set(newKey.trim(), '');
                setNewKey('');
              }}
            >
              Add field
            </button>
          </div>
        )}
      </fieldset>
    );
  }
  return (
    <label className="field" htmlFor={id}>
      {caption(name)}
      <input
        id={id}
        autoComplete={protectedValue ? 'new-password' : 'off'}
        type={
          protectedValue
            ? 'password'
            : ['integer', 'number'].includes(schema.type ?? '')
              ? 'number'
              : 'text'
        }
        step={schema.type === 'integer' ? 1 : 'any'}
        value={value ?? ''}
        onChange={(event) =>
          onChange(
            ['number', 'integer'].includes(schema.type ?? '')
              ? event.target.value === ''
                ? undefined
                : Number(event.target.value)
              : event.target.value,
          )
        }
      />
      {schema.description && <small>{plainDescription(schema.description).slice(0, 280)}</small>}
    </label>
  );
}
