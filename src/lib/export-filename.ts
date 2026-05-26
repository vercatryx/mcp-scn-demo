export function sanitizeDownloadFilenameBase(label: string): string {
    let s = label
        .replace(/[\x00-\x1f<>:"/\\|?*]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    s = s.replace(/^\.+|\.+$/g, '');
    if (!s) s = 'Data export';
    if (s.length > 100) s = s.slice(0, 100).trim();
    return s;
}

export function buildFriendlyXlsxFilename(downloadLabel: string): string {
    const base = sanitizeDownloadFilenameBase(downloadLabel);
    const dateStr = new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/New_York',
    });
    return `${base} - ${dateStr}.xlsx`;
}
