import postgres from 'postgres';
import { getPostgresUrl, resolvePostgresUrl } from './postgres-url.js';

const BLOCKED = /\b(insert|update|delete|drop|alter|truncate|grant|revoke|execute|call|copy\s+to|copy\s+from)\b/i;

export const DB_UNAVAILABLE =
    'Database is not configured or the query failed. Check DATABASE_URL on the MCP server.';

export function validateReadonlySelect(sql: string): { ok: true; sql: string } | { ok: false; error: string } {
    const raw = sql.trim().replace(/^\uFEFF/, '');
    if (!raw) return { ok: false, error: 'SQL is empty.' };
    if (raw.length > 48_000) return { ok: false, error: 'SQL exceeds maximum length.' };
    if (BLOCKED.test(raw)) {
        return { ok: false, error: 'Only read-only SELECT/WITH queries are allowed (blocked keyword detected).' };
    }
    const one = raw.replace(/;+\s*$/g, '').trim();
    if (one.includes(';')) return { ok: false, error: 'Multiple statements are not allowed (use a single SELECT/WITH).' };
    if (!/^\s*(with|select)\b/i.test(one)) {
        return { ok: false, error: 'Query must start with SELECT or WITH.' };
    }
    return { ok: true, sql: one };
}

export type RunSelectResult = {
    columns: string[];
    rows: Record<string, unknown>[];
    row_count: number;
    truncated: boolean;
    max_rows_applied: number;
};

export async function runReadonlySelect(sql: string, maxRows = 300): Promise<RunSelectResult> {
    const url = await resolvePostgresUrl();
    if (!url) {
        console.error('[data-copilot-mcp] No Postgres URL configured');
        throw new Error(DB_UNAVAILABLE);
    }
    const v = validateReadonlySelect(sql);
    if (!v.ok) throw new Error(v.error);
    const lim = Math.min(Math.max(1, maxRows), 1000);
    return runReadonlySelectWithLimit(v.sql, lim, url);
}

const EXPORT_HARD_CAP = 25_000;

export async function runReadonlySelectForExport(sql: string, maxRows = 10_000): Promise<RunSelectResult> {
    const url = await resolvePostgresUrl();
    if (!url) {
        console.error('[data-copilot-mcp] No Postgres URL configured for export');
        throw new Error(DB_UNAVAILABLE);
    }
    const v = validateReadonlySelect(sql);
    if (!v.ok) throw new Error(v.error);
    const lim = Math.min(Math.max(1, maxRows), EXPORT_HARD_CAP);
    return runReadonlySelectWithLimit(v.sql, lim, url);
}

async function runReadonlySelectWithLimit(
    validatedInnerSql: string,
    lim: number,
    url: string
): Promise<RunSelectResult> {
    const wrapped = `SELECT * FROM (${validatedInnerSql}) AS _data_copilot_sub LIMIT ${lim + 1}`;

    const sqlCon = postgres(url, {
        max: 1,
        idle_timeout: 20,
        connect_timeout: 30,
        ssl: 'require',
    });
    try {
        const rows = (await sqlCon.unsafe(wrapped)) as Record<string, unknown>[];
        const truncated = rows.length > lim;
        const out = truncated ? rows.slice(0, lim) : rows;
        const columns = out.length > 0 ? Object.keys(out[0] as object) : [];
        return {
            columns,
            rows: out,
            row_count: out.length,
            truncated,
            max_rows_applied: lim,
        };
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[data-copilot-mcp] SQL query failed:', msg);
        throw new Error(DB_UNAVAILABLE);
    } finally {
        await sqlCon.end({ timeout: 5 }).catch(() => undefined);
    }
}

export function isPostgresConfigured(): boolean {
    return Boolean(getPostgresUrl());
}
