import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildQueryExportWorkbook } from './lib/build-xlsx.js';
import { loadDictionaryExcerpt } from './lib/dictionary.js';
import { buildFriendlyXlsxFilename } from './lib/export-filename.js';
import { tryPublishXlsxPublicUrl } from './lib/publish-r2.js';
import { runReadonlySelect, runReadonlySelectForExport } from './lib/read-sql.js';

const SCHEMA_URI = 'demo-food://data-dictionary';

export function createDataCopilotMcpServer(): McpServer {
    const server = new McpServer(
        { name: 'demo-food-data-copilot', version: '1.0.0' },
        {
            instructions: `Demo Food internal data copilot (read-only).
Use the database-schema resource before writing SQL. Only SELECT/WITH queries.
When the user wants tabular results, prefer export_select_to_xlsx so they get a download link.
Billing weeks are Sunday–Saturday in America/New_York.`,
        }
    );

    server.registerResource(
        'database-schema',
        SCHEMA_URI,
        {
            description:
                'Demo Food database data dictionary (tables, columns, pitfalls). Read before writing SQL.',
            mimeType: 'text/markdown',
        },
        async () => ({
            contents: [
                {
                    uri: SCHEMA_URI,
                    mimeType: 'text/markdown',
                    text: loadDictionaryExcerpt(60_000),
                },
            ],
        })
    );

    server.registerTool(
        'run_select_query',
        {
            description:
                'Run a read-only SELECT or WITH against Demo Food Postgres. Returns up to 1000 rows (default 300). Use to explore before exporting.',
            inputSchema: {
                sql: z.string().describe('Single SELECT or WITH statement.'),
                max_rows: z
                    .number()
                    .int()
                    .min(1)
                    .max(1000)
                    .optional()
                    .describe('Max rows (default 300, hard cap 1000).'),
            },
        },
        async ({ sql, max_rows }) => {
            const r = await runReadonlySelect(sql, max_rows ?? 300);
            const structuredContent = {
                ok: true as const,
                columns: r.columns,
                row_count: r.row_count,
                truncated: r.truncated,
                max_rows_applied: r.max_rows_applied,
                sample_rows: r.rows.slice(0, 25),
            };
            return {
                content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
                structuredContent,
            };
        }
    );

    server.registerTool(
        'export_select_to_xlsx',
        {
            description:
                'Export one read-only SELECT/WITH to an Excel file. Returns a public download URL when R2 is configured. Use whenever the user wants spreadsheet output.',
            inputSchema: {
                sql: z.string().describe('Single SELECT or WITH to export.'),
                download_label: z
                    .string()
                    .describe(
                        'Human-readable file title (3–10 words), e.g. "Orders stuck in billing over 14 days".'
                    ),
                sheet_name: z.string().optional().describe('Optional Excel tab name (≤31 chars).'),
                max_rows: z
                    .number()
                    .int()
                    .min(1)
                    .max(25_000)
                    .optional()
                    .describe('Max rows (default 10000, hard cap 25000).'),
            },
        },
        async ({ sql, download_label, sheet_name, max_rows }) => {
            const downloadLabel = download_label.trim();
            const tab =
                (sheet_name ?? downloadLabel ?? 'Export').trim().slice(0, 80) || 'Export';
            const r = await runReadonlySelectForExport(sql, max_rows ?? 10_000);
            const buf = buildQueryExportWorkbook(r.rows, tab);
            const fname = buildFriendlyXlsxFilename(downloadLabel || tab);
            const publicUrl = await tryPublishXlsxPublicUrl(buf, fname);

            if (!publicUrl) {
                throw new Error(
                    'Excel export requires R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_DOMAIN).'
                );
            }

            const structuredContent = {
                ok: true as const,
                download_url: publicUrl,
                filename: fname,
                row_count: r.row_count,
                truncated: r.truncated,
                max_rows_applied: r.max_rows_applied,
                column_count: r.columns.length,
            };
            return {
                content: [
                    {
                        type: 'text',
                        text: `Exported ${r.row_count} rows to ${fname}.\nDownload: ${publicUrl}`,
                    },
                ],
                structuredContent,
            };
        }
    );

    return server;
}
