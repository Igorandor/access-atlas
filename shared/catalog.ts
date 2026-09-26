import { register } from './register';
/** Small compatibility view for native contract probes; the UI uses the Atlas register directly. */
export const entities = Object.fromEntries(
  register.map((entry) => [
    entry.key,
    {
      id: entry.key,
      title: entry.title,
      singular: entry.title,
      description: entry.title,
      list: entry.list,
      detail: entry.record,
      key: entry.identity,
      param: entry.parameter,
      columns: [entry.identity],
      fields: [] as string[],
      createMethod: entry.create,
      readonly: !entry.create,
      noDetail: entry.opaque,
      defaults: {} as Record<string, any>,
      privilege: entry.section === 'permissions' || entry.section === 'apps' ? 'Secure' : 'Operate',
    },
  ]),
);
export const label = (name: string) =>
  name === 'NameSpace' ? 'Namespace' : name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
