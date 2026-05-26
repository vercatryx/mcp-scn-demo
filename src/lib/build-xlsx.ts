import * as XLSX from 'xlsx';

function safeSheetName(name: string): string {
    const n = name.replace(/[*?:/\\[\]]/g, '_').slice(0, 31);
    return n.length ? n : 'Export';
}

function serializeCell(v: unknown): unknown {
    if (typeof v === 'bigint') return v.toString();
    if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
        try {
            return JSON.stringify(v);
        } catch {
            return String(v);
        }
    }
    if (Array.isArray(v) || (typeof v === 'object' && v !== null)) {
        try {
            return JSON.stringify(v);
        } catch {
            return String(v);
        }
    }
    return v;
}

function serializeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    return rows.map((r) => {
        const o: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) {
            o[k] = serializeCell(v);
        }
        return o;
    });
}

export function buildQueryExportWorkbook(rows: Record<string, unknown>[], sheetName: string): Buffer {
    const wb = XLSX.utils.book_new();
    const data = rows.length ? serializeRows(rows) : [{ _message: 'No rows returned.' }];
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(sheetName));
    const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}
