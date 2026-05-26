import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createDataCopilotMcpServer } from './mcp-server.js';
import { isPostgresConfigured } from './lib/read-sql.js';

function parseAllowedHosts(): string[] | undefined {
    const raw = process.env.MCP_ALLOWED_HOSTS?.trim();
    if (!raw) return undefined;
    return raw
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean);
}

const host = process.env.HOST?.trim() || '0.0.0.0';
const port = Number(process.env.PORT || 8080);
const allowedHosts = parseAllowedHosts();

const app = createMcpExpressApp({ host, allowedHosts });

app.get('/health', (_req, res) => {
    res.json({
        ok: true,
        postgres: isPostgresConfigured(),
        r2: Boolean(
            process.env.R2_ACCOUNT_ID &&
                process.env.R2_ACCESS_KEY_ID &&
                process.env.R2_SECRET_ACCESS_KEY &&
                process.env.R2_BUCKET_NAME &&
                (process.env.R2_PUBLIC_DOMAIN || process.env.NEXT_PUBLIC_R2_DOMAIN)
        ),
    });
});

app.post('/mcp', async (req, res) => {
    const server = createDataCopilotMcpServer();
    try {
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        res.on('close', () => {
            transport.close().catch(() => undefined);
            server.close().catch(() => undefined);
        });
    } catch (error) {
        console.error('[data-copilot-mcp] MCP request error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: { code: -32603, message: 'Internal server error' },
                id: null,
            });
        }
    }
});

app.get('/mcp', (_req, res) => {
    res.status(405).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed. Use POST.' },
        id: null,
    });
});

app.delete('/mcp', (_req, res) => {
    res.status(405).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed.' },
        id: null,
    });
});

app.listen(port, host, () => {
    console.log(`[data-copilot-mcp] listening on http://${host}:${port}`);
    console.log(`[data-copilot-mcp] MCP endpoint: POST /mcp (no auth)`);
    if (!isPostgresConfigured()) {
        console.warn('[data-copilot-mcp] WARNING: DATABASE_URL is not configured');
    }
});
