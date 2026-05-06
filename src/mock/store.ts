/**
 * In-memory reactive data store for design mode.
 *
 * Provides a simple table-based store with CRUD operations and
 * pub/sub reactivity via useSyncExternalStore.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = Record<string, any>;

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const tables = new Map<string, Map<string, Doc>>();

function ensureTable(name: string): Map<string, Doc> {
  let table = tables.get(name);
  if (!table) {
    table = new Map();
    tables.set(name, table);
  }
  return table;
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

const counters = new Map<string, number>();

function nextId(tableName: string): string {
  const n = (counters.get(tableName) ?? 0) + 1;
  counters.set(tableName, n);
  return `mock_${tableName}_${n}`;
}

// ---------------------------------------------------------------------------
// Reactivity (useSyncExternalStore compatible)
// ---------------------------------------------------------------------------

let version = 0;
const listeners = new Set<() => void>();

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getSnapshot(): number {
  return version;
}

export function notify(): void {
  version++;
  for (const cb of listeners) cb();
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Insert a document into a table. Returns the auto-generated `_id`.
 * Adds `_id` and `_creationTime` automatically.
 */
export function insert(tableName: string, doc: Doc): string {
  const table = ensureTable(tableName);
  const id = nextId(tableName);
  table.set(id, { ...doc, _id: id, _creationTime: Date.now() });
  notify();
  return id;
}

/**
 * Get a single document by ID. Returns `null` if not found.
 */
export function get(tableName: string, id: string): Doc | null {
  const table = tables.get(tableName);
  if (!table) return null;
  return table.get(id) ?? null;
}

/**
 * Return all documents in a table as an array.
 */
export function query(tableName: string): Doc[] {
  const table = tables.get(tableName);
  if (!table) return [];
  return [...table.values()];
}

/**
 * Patch (shallow merge) fields into an existing document.
 */
export function patch(tableName: string, id: string, fields: Doc): void {
  const table = tables.get(tableName);
  if (!table) return;
  const existing = table.get(id);
  if (!existing) return;
  table.set(id, { ...existing, ...fields });
  notify();
}

/**
 * Delete a document by ID.
 */
export function remove(tableName: string, id: string): void {
  const table = tables.get(tableName);
  if (!table) return;
  table.delete(id);
  notify();
}
