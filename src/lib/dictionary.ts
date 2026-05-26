import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_PATHS = [
    process.env.DATA_DICTIONARY_PATH?.trim(),
    path.resolve(__dirname, '../../../demo-food/docs/DATABASE_DATA_DICTIONARY.md'),
    path.resolve(process.cwd(), 'docs/DATABASE_DATA_DICTIONARY.md'),
].filter((p): p is string => Boolean(p));

export function loadDictionaryExcerpt(maxChars = 45_000): string {
    for (const p of DEFAULT_PATHS) {
        if (!fs.existsSync(p)) continue;
        const raw = fs.readFileSync(p, 'utf8');
        if (raw.length <= maxChars) return raw;
        return (
            raw.slice(0, maxChars) +
            '\n\n… [truncated; set DATA_DICTIONARY_PATH or deploy with full dictionary file]'
        );
    }
    return '(No DATABASE_DATA_DICTIONARY.md found. Set DATA_DICTIONARY_PATH to the schema doc from demo-food.)';
}
