import postgres from 'postgres';

const PLACEHOLDER = /\[REF\]|\[PASSWORD\]|REQUIRED|CHANGE_ME/i;

export function supabaseProjectRefFromEnv(): string | undefined {
    const api =
        process.env.SUPABASE_URL?.trim() ||
        process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (api) {
        try {
            return new URL(api).hostname.split('.')[0] || undefined;
        } catch {
            /* ignore */
        }
    }
    return undefined;
}

function isPlaceholderUrl(url: string): boolean {
    return PLACEHOLDER.test(url);
}

export type ParsedPgCreds = {
    username: string;
    password: string;
    host: string;
    port: string;
    database: string;
};

export function parsePostgresUrl(raw: string): ParsedPgCreds | null {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('prisma+') || isPlaceholderUrl(trimmed)) {
        return null;
    }
    try {
        const parsed = new URL(trimmed.replace(/^postgres:/, 'postgresql:'));
        return {
            username: decodeURIComponent(parsed.username),
            password: decodeURIComponent(parsed.password),
            host: parsed.hostname,
            port: parsed.port || '5432',
            database: parsed.pathname.replace(/^\//, '') || 'postgres',
        };
    } catch {
        return null;
    }
}

export function buildPostgresUrl(creds: ParsedPgCreds): string {
    const user = encodeURIComponent(creds.username);
    const pass = encodeURIComponent(creds.password);
    return `postgres://${user}:${pass}@${creds.host}:${creds.port}/${creds.database}`;
}

export function poolerHostCandidates(configuredHost: string | undefined): string[] {
    const override = process.env.SUPABASE_POOLER_HOST?.trim();
    const out: string[] = [];
    if (override) out.push(override);
    if (configuredHost && !out.includes(configuredHost)) out.push(configuredHost);
    for (let i = 0; i <= 2; i++) {
        for (const region of [
            'us-east-1',
            'us-east-2',
            'us-west-1',
            'us-west-2',
            'eu-west-1',
            'ap-south-1',
            'ap-southeast-1',
        ]) {
            const h = `aws-${i}-${region}.pooler.supabase.com`;
            if (!out.includes(h)) out.push(h);
        }
    }
    return out;
}

let cachedWorkingPoolerHost: string | null | undefined;

export async function discoverWorkingPoolerHost(creds: ParsedPgCreds): Promise<string | null> {
    if (cachedWorkingPoolerHost !== undefined) return cachedWorkingPoolerHost;

    const ref = supabaseProjectRefFromEnv();
    const user =
        creds.username.includes('.') || !ref ? creds.username : `postgres.${ref}`;

    for (const host of poolerHostCandidates(creds.host)) {
        for (const port of ['5432', '6543']) {
            const trial = buildPostgresUrl({ ...creds, host, port, username: user });
            const sql = postgres(trial, { max: 1, ssl: 'require', connect_timeout: 10 });
            try {
                await sql`select 1 as ok`;
                cachedWorkingPoolerHost = host;
                return host;
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                if (/password authentication failed/i.test(msg)) {
                    cachedWorkingPoolerHost = host;
                    return host;
                }
            } finally {
                await sql.end({ timeout: 3 }).catch(() => undefined);
            }
        }
    }
    cachedWorkingPoolerHost = null;
    return null;
}

export function normalizePostgresUrlForNode(raw: string, hostOverride?: string): string | null {
    const creds = parsePostgresUrl(raw);
    if (!creds) return null;
    if (hostOverride) creds.host = hostOverride;
    return buildPostgresUrl(creds);
}

export function getPostgresUrl(): string | undefined {
    const candidates = [
        process.env.INTERNAL_REPORTS_POSTGRES_URL,
        process.env.SUPABASE_DATABASE_URL,
        process.env.DATABASE_URL,
    ];
    const expectedRef = supabaseProjectRefFromEnv();

    for (const c of candidates) {
        const raw = c?.trim();
        if (!raw) continue;
        const creds = parsePostgresUrl(raw);
        if (!creds) continue;

        if (expectedRef) {
            const refInUser = creds.username.includes('.')
                ? creds.username.split('.').slice(1).join('.')
                : '';
            if (refInUser && refInUser !== expectedRef) continue;
        }
        const normalized = normalizePostgresUrlForNode(raw);
        if (normalized) return normalized;
    }
    return undefined;
}

export async function resolvePostgresUrl(): Promise<string | undefined> {
    const raw =
        process.env.INTERNAL_REPORTS_POSTGRES_URL?.trim() ||
        process.env.SUPABASE_DATABASE_URL?.trim() ||
        process.env.DATABASE_URL?.trim();
    if (!raw) return undefined;

    const creds = parsePostgresUrl(raw);
    if (!creds) return undefined;

    const direct = normalizePostgresUrlForNode(raw);
    if (!direct) return undefined;

    const sql = postgres(direct, { max: 1, ssl: 'require', connect_timeout: 10 });
    try {
        await sql`select 1 as ok`;
        return direct;
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/tenant or user not found/i.test(msg)) {
            return direct;
        }
    } finally {
        await sql.end({ timeout: 3 }).catch(() => undefined);
    }

    const host = await discoverWorkingPoolerHost(creds);
    if (!host) return direct;
    return normalizePostgresUrlForNode(raw, host) ?? direct;
}
