// Discord removes attachments from its CDN when a message is deleted, so to show deleted
// images in the logs we keep a copy of recent images in memory, within a size budget.
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const MAX_IMAGES_PER_MESSAGE = 4;

// messageId -> { savedAt, files: [{ name, buffer }] }, in insertion (oldest first) order
const cache = new Map();
let totalBytes = 0;

function isImage(attachment) {
    return attachment.contentType?.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(attachment.name);
}

function evict(messageId) {
    const entry = cache.get(messageId);
    if (!entry) return;
    for (const file of entry.files) totalBytes -= file.buffer.length;
    cache.delete(messageId);
}

async function download(url, maxBytes = MAX_FILE_BYTES) {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error("File too large");
    return buffer;
}

async function cacheMessageImages(message) {
    const images = [...message.attachments.values()]
        .filter(a => isImage(a) && a.size <= MAX_FILE_BYTES)
        .slice(0, MAX_IMAGES_PER_MESSAGE);
    if (!images.length) return;

    const files = [];
    for (const image of images) {
        const buffer = await download(image.url).catch(() => null);
        if (buffer) files.push({ name: image.name, buffer });
    }
    if (!files.length) return;

    cache.set(message.id, { savedAt: Date.now(), files });
    totalBytes += files.reduce((sum, f) => sum + f.buffer.length, 0);

    for (const [id, entry] of cache) {
        if (totalBytes <= MAX_TOTAL_BYTES && Date.now() - entry.savedAt < MAX_AGE_MS) break;
        evict(id);
    }
}

// Returns the cached images for a deleted message (and forgets them), falling back to a
// last-chance download from Discord's media proxy for uncached ones.
async function takeDeletedImages(message) {
    const entry = cache.get(message.id);
    if (entry) {
        evict(message.id);
        return entry.files;
    }
    if (message.partial) return [];

    const files = [];
    for (const image of [...message.attachments.values()].filter(isImage).slice(0, MAX_IMAGES_PER_MESSAGE)) {
        const buffer = await download(image.proxyURL).catch(() => null);
        if (buffer) files.push({ name: image.name, buffer });
    }
    return files;
}

module.exports = { cacheMessageImages, takeDeletedImages, forgetMessage: evict, isImage };
