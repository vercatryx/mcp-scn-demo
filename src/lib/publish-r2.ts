import { randomBytes } from 'crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

function isR2Configured(): boolean {
    return Boolean(
        process.env.R2_ACCOUNT_ID?.trim() &&
            process.env.R2_ACCESS_KEY_ID?.trim() &&
            process.env.R2_SECRET_ACCESS_KEY?.trim() &&
            process.env.R2_BUCKET_NAME?.trim() &&
            (process.env.R2_PUBLIC_DOMAIN?.trim() || process.env.NEXT_PUBLIC_R2_DOMAIN?.trim())
    );
}

export async function tryPublishXlsxPublicUrl(buffer: Buffer, displayFileName: string): Promise<string | null> {
    if (!isR2Configured()) return null;

    const domain = (process.env.R2_PUBLIC_DOMAIN || process.env.NEXT_PUBLIC_R2_DOMAIN)!.trim();
    const accountId = process.env.R2_ACCOUNT_ID!.trim();
    const bucket = process.env.R2_BUCKET_NAME!.trim();

    const raw = (displayFileName || 'export.xlsx').trim();
    const baseName = raw.replace(/\.xlsx$/i, '').trim() || 'export';
    const safeBase = baseName
        .replace(/[^\w.-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 92);
    const uniq = randomBytes(5).toString('hex');
    const key = `data-copilot-mcp/${new Date().toISOString().slice(0, 10)}/${safeBase || 'export'}-${uniq}.xlsx`;

    const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID!.trim(),
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!.trim(),
        },
    });

    try {
        await s3.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: buffer,
                ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            })
        );
    } catch (e) {
        console.error('[data-copilot-mcp] R2 upload failed', e);
        return null;
    }

    const base = domain.replace(/\/$/, '');
    return base.startsWith('http') ? `${base}/${key}` : `https://${base}/${key}`;
}
