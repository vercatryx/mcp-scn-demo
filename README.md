# Data Copilot MCP (read-only)

Standalone [Model Context Protocol](https://modelcontextprotocol.io) server for Demo Food analytics. Use it as a **ChatGPT connector**, Claude Desktop remote server, or any MCP client over HTTPS.

**Read-only:** `SELECT` / `WITH` only. No writes.

**Auth:** single API key (`Authorization: Bearer …` or `X-API-Key`).

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
# Edit .env: DATA_COPILOT_MCP_API_KEY, DATABASE_URL, R2_* …

npm install
npm run dev
```

Health: `GET http://localhost:8080/health` (no auth)

MCP: `POST http://localhost:8080/mcp` with header:

```http
Authorization: Bearer your-secret-key
```

## Railway

Deploys via **Dockerfile** (avoids Nixpacks double-`npm ci` / `EBUSY` on `node_modules/.cache`).

1. New service → GitHub repo **`vercatryx/mcp-scn-demo`** (repo root is this package).
2. Variables:
   - `DATA_COPILOT_MCP_API_KEY` — long random string
   - `DATABASE_URL` — Postgres URI (prefer a **read-only** DB user)
   - `R2_*` + `R2_PUBLIC_DOMAIN` — required for Excel exports
   - `MCP_ALLOWED_HOSTS` — e.g. `your-app.up.railway.app`
   - Optional `DATA_DICTIONARY_PATH` if the dictionary file is not in the default monorepo path
3. Deploy; note the public URL: `https://your-app.up.railway.app/mcp`

## ChatGPT

1. Enable **Developer mode** (or build a connector in settings).
2. Add MCP server URL: `https://your-app.up.railway.app/mcp`
3. Authentication: **API key / Bearer** → paste the same value as `DATA_COPILOT_MCP_API_KEY`.

Tell the model to read the `database-schema` resource before querying.

## Security

- Use a **read-only** Postgres role when possible.
- Rotate `DATA_COPILOT_MCP_API_KEY` if leaked.
- Do not expose this URL publicly without a strong key; consider IP restrictions on Railway if available.

## Regenerate schema docs

From `demo-food`:

```bash
npm run db:docs
```

The MCP server reads `demo-food/docs/DATABASE_DATA_DICTIONARY.md` by default when deployed from the monorepo.
