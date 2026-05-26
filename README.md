# Data Copilot MCP (read-only)

Standalone [Model Context Protocol](https://modelcontextprotocol.io) server for Demo Food analytics. Use it as a **ChatGPT connector**, Claude Desktop remote server, or any MCP client over HTTPS.

**Read-only:** `SELECT` / `WITH` only. No writes.

**Auth:** none — `/mcp` is open (use a private URL + read-only DB user; do not expose broadly).

## Tools

| Tool | Purpose |
|------|---------|
| `run_select_query` | Preview query (≤1000 rows) |
| `export_select_to_xlsx` | Full export → public `.xlsx` URL (requires R2) |

## Resource

| URI | Purpose |
|-----|---------|
| `demo-food://data-dictionary` | Schema / data dictionary (markdown) |

## Local dev

```bash
cd data-copilot-mcp
cp .env.example .env
# Edit .env: DATABASE_URL, R2_* …

npm install
npm run dev
```

Health: `GET http://localhost:8080/health`

MCP: `POST http://localhost:8080/mcp` (no headers required)

## Railway

Deploys via **Dockerfile**.

1. GitHub repo **`vercatryx/mcp-scn-demo`**
2. Variables: `DATABASE_URL`, `R2_*`, optional `MCP_ALLOWED_HOSTS`
3. URL: `https://your-app.up.railway.app/mcp`

## ChatGPT

1. Add connector URL: `https://your-app.up.railway.app/mcp`
2. Authentication: **None** (no API key)

## Security

- Use a **read-only** Postgres role.
- Anyone with the URL can query your database — keep the Railway URL private.

## Regenerate schema docs

From `demo-food`:

```bash
npm run db:docs
```
