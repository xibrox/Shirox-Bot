const sharp = require("sharp");

const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024; // Discord's default upload limit for bots
const MAX_DIMENSION = 1024;

// Converts an image (png, jpg, webp, animated webp, gif...) to a GIF, shrinking it until it fits Discord's upload limit
async function convertToGif(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Couldn't download the image (HTTP ${res.status}).`);
    const input = Buffer.from(await res.arrayBuffer());
    if (input.length > MAX_INPUT_BYTES) throw new Error("That image is too large (max 25 MB).");

    let metadata;
    try {
        metadata = await sharp(input, { animated: true }).metadata();
    } catch {
        throw new Error("That file isn't a supported image. Videos can't be converted.");
    }

    // For animated images `height` is the total of all frames, so use pageHeight for one frame
    const frameHeight = metadata.pageHeight || metadata.height;
    let width = Math.min(metadata.width, Math.round(metadata.width * MAX_DIMENSION / Math.max(metadata.width, frameHeight)));

    for (let attempt = 0; attempt < 5; attempt++) {
        const output = await sharp(input, { animated: true })
            .resize({ width, withoutEnlargement: true })
            .gif({ effort: 7 })
            .toBuffer();
        if (output.length <= MAX_OUTPUT_BYTES) return output;
        width = Math.round(width * 0.7);
    }
    throw new Error("The GIF is still too large after shrinking it. Try a smaller image.");
}

// Finds the first image in a message: attachments first, then embeds (e.g. pasted links)
function findImageUrl(message) {
    const attachment = message.attachments.find(a => a.contentType?.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|tiff?)$/i.test(a.name));
    if (attachment) return attachment.url;
    for (const embed of message.embeds) {
        const url = embed.image?.url || embed.thumbnail?.url;
        if (url) return url;
    }
    return null;
}

module.exports = { convertToGif, findImageUrl };
