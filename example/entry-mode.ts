export type EntryMode = 'demo' | 'api' | 'lifecycle' | 'benchmark';

/** Keep diagnostic modes explicit and reject ambiguous build configurations. */
export function selectEntryMode(flags: { api?: string; lifecycle?: string; benchmark?: string }): EntryMode {
  const selected = (Object.entries(flags) as [Exclude<EntryMode, 'demo'>, string | undefined][])
    .filter(([, value]) => value === '1');
  if (selected.length > 1) throw new Error('Select only one GLMap diagnostic entry mode');
  return selected[0]?.[0] ?? 'demo';
}
