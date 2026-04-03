export interface SqliteConn {
  all<T = unknown>(sql: string, params?: unknown[]): T[];
  get<T = unknown>(sql: string, params?: unknown[]): T | null;
  close(): void;
}

function toParams(params?: unknown[]): unknown[] {
  return Array.isArray(params) ? params : [];
}

export async function openOpenCodeSqliteReadOnly(dbPath: string): Promise<SqliteConn> {
  const mod = await import("bun:sqlite");
  const Database = (mod as any).Database as any;
  const db = new Database(dbPath, { readonly: true });

  // Keep reads deterministic and avoid accidental writes.
  try {
    db.query("PRAGMA query_only = ON;").run();
  } catch {
    // ignore
  }

  // Avoid transient SQLITE_BUSY errors (WAL).
  try {
    db.query("PRAGMA busy_timeout = 5000;").run();
  } catch {
    // ignore
  }

  return {
    all<T = unknown>(sql: string, params?: unknown[]): T[] {
      const stmt = db.query(sql);
      const p = toParams(params);
      return (p.length ? stmt.all(...p) : stmt.all()) as T[];
    },

    get<T = unknown>(sql: string, params?: unknown[]): T | null {
      const stmt = db.query(sql);
      const p = toParams(params);
      const row = (p.length ? stmt.get(...p) : stmt.get()) as T | undefined;
      return row ?? null;
    },

    close(): void {
      try {
        db.close();
      } catch {
        // ignore
      }
    },
  };
}
