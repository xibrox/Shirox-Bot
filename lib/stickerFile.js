const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { detectFormat, findFfmpeg, runFfmpeg, runExclusive, TMP_DIR } = require("./gif");

// Discord's limits for server stickers
const STICKER_MAX_BYTES = 512 * 1024;
const STICKER_SIZE = 320;
const MAX_SECONDS = 10;
// Tried in order until the sticker fits under 512 KB: fewer frames and colours each time
const ATTEMPTS = [[15, 256], [12, 128], [10, 64], [8, 32]];

const pngSize = buffer => [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
const gifSize = buffer => [buffer.readUInt16LE(6), buffer.readUInt16LE(8)];

// Runs ffmpeg on `input` (written to a temp file, since ffmpeg needs to seek in GIFs and videos)
async function withTempInput(input, task) {
    if (!findFfmpeg()) throw new Error("Converting needs ffmpeg, which isn't installed on the bot's host.");
    fs.mkdirSync(TMP_DIR, { recursive: true });
    const inputPath = path.join(TMP_DIR, `${crypto.randomBytes(6).toString("hex")}.input`);
    fs.writeFileSync(inputPath, input);
    try {
        return await runExclusive(() => task(inputPath));
    } finally {
        fs.rm(inputPath, { force: true }, () => {});
    }
}

// Any image, GIF or short video -> { buffer, ext } that Discord accepts as a sticker (320x320, max 512 KB)
async function toStickerFile(input) {
    const format = detectFormat(input);
    if (!format) throw new Error("That file is empty or not a supported image.");
    // Files that already fit are kept as they are, so they don't lose quality
    if ((format === "png" || format === "gif") && input.length <= STICKER_MAX_BYTES
        && (format === "png" ? pngSize(input) : gifSize(input)).every(side => side <= STICKER_SIZE)) {
        return { buffer: input, ext: format };
    }

    return withTempInput(input, async inputPath => {
        for (const [fps, colors] of ATTEMPTS) {
            // Fit inside 320x320 and pad the rest with transparency, keeping the GIF's transparency
            const filter =
                `fps=${fps},scale=${STICKER_SIZE}:${STICKER_SIZE}:force_original_aspect_ratio=decrease,` +
                `pad=${STICKER_SIZE}:${STICKER_SIZE}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,split[a][b];` +
                `[a]palettegen=max_colors=${colors}:reserve_transparent=1[p];[b][p]paletteuse=alpha_threshold=128`;
            const output = await runFfmpeg([
                "-hide_banner", "-loglevel", "error", "-t", String(MAX_SECONDS), "-i", inputPath,
                "-vf", filter, "-loop", "0", "-f", "gif", "pipe:1",
            ]);
            if (output.length && output.length <= STICKER_MAX_BYTES) return { buffer: output, ext: "gif" };
        }
        throw new Error("I couldn't make it small enough for a sticker (512 KB). Try a shorter or simpler GIF.");
    });
}

// A sticker's PNG/APNG/GIF file -> a GIF, keeping animated PNG stickers animated
async function stickerToGif(input) {
    if (detectFormat(input) === "gif") return input;
    return withTempInput(input, inputPath => runFfmpeg([
        "-hide_banner", "-loglevel", "error", "-i", inputPath,
        "-vf", "split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse=alpha_threshold=128",
        "-loop", "0", "-f", "gif", "pipe:1",
    ]));
}

module.exports = { toStickerFile, stickerToGif, STICKER_MAX_BYTES };
