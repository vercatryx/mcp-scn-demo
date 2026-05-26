import type { Request, Response, NextFunction } from 'express';

export function getApiKey(): string | undefined {
    return process.env.DATA_COPILOT_MCP_API_KEY?.trim() || undefined;
}

export function extractBearerApiKey(req: Request): string | undefined {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
    const xKey = req.headers['x-api-key'];
    if (typeof xKey === 'string' && xKey.trim()) return xKey.trim();
    return undefined;
}

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
    const expected = getApiKey();
    if (!expected) {
        res.status(503).json({
            error: 'Server misconfigured: DATA_COPILOT_MCP_API_KEY is not set.',
        });
        return;
    }
    const provided = extractBearerApiKey(req);
    if (!provided || provided !== expected) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    next();
}
