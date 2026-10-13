import type { PoolClient } from 'pg';

export type TagScope = 'task' | 'note' | 'spend';

export const DEFAULT_TAGS: Record<'task' | 'note', string[]> = {
  task: ['Work', 'Personal', 'Others'],
  note: ['Personal', 'Work', 'Ideas', 'Health'],
};

export const SPEND_CATEGORIES = [
  { id: 'food', label: '🍽️ Food' }, { id: 'transport', label: '🚌 Transport' }, { id: 'shopping', label: '🛍️ Shopping' },
  { id: 'bills', label: '🧾 Bills' }, { id: 'health', label: '💊 Health' }, { id: 'fun', label: '🎬 Fun' },
  { id: 'study', label: '📚 Study & fees' }, { id: 'other', label: '📦 Other' },
];

/** Custom tags the person has added in one area. */
export async function customTags(c: PoolClient, userId: string, scope: TagScope): Promise<{ id: string; name: string }[]> {
  try {
    const { rows } = await c.query<{ id: string; name: string }>(
      `select id, name from custom_tags where user_id = $1 and scope = $2 order by name`, [userId, scope]);
    return rows;
  } catch {
    return [];
  }
}

/** Built-in and custom tags together, for a dropdown. */
export async function tagOptions(c: PoolClient, userId: string, scope: 'task' | 'note'): Promise<string[]> {
  const custom = (await customTags(c, userId, scope)).map(t => t.name);
  return [...new Set([...DEFAULT_TAGS[scope], ...custom])];
}

/** The tag to save: a new name typed by the user wins (and is remembered), otherwise the selected one. */
export async function resolveTag(c: PoolClient, userId: string, scope: TagScope, selected: string, created: string, fallback: string): Promise<string> {
  const name = created.trim().slice(0, 20);
  if (name) {
    try {
      await c.query(
        `insert into custom_tags (user_id, scope, name) values ($1, $2, $3) on conflict (user_id, scope, name) do nothing`,
        [userId, scope, name]);
    } catch { /* tags table not migrated yet: still use the typed name */ }
    return name;
  }
  return selected.trim().slice(0, 20) || fallback;
}
