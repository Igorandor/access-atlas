import { bodySchema, resolveSchema } from './schema';
/** The supplied Task contract requires every scalar/list on creation. */
export function taskDefaults(username: string): Record<string, any> {
  const draft: Record<string, any> = {};
  for (const [name, definition] of Object.entries(
    bodySchema('/v2/task', 'POST').properties ?? {},
  )) {
    const field = resolveSchema(definition);
    draft[name] =
      field.type === 'array'
        ? []
        : field.type === 'object'
          ? {}
          : field.type === 'boolean'
            ? false
            : ['integer', 'number'].includes(field.type ?? '')
              ? 0
              : '';
  }
  Object.assign(draft, {
    RunAsUser: username,
    NameSpace: '%SYS',
    Priority: 'Normal',
    TimePeriod: 'On Demand',
    DailyFrequency: 'Once',
    DailyStartTime: '00:00:00',
    DailyEndTime: '00:00:00',
    StartDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
    MirrorStatus: 'Any',
    SuspendOnError: true,
    SuspendTerminated: true,
    RescheduleOnStart: true,
  });
  return draft;
}
