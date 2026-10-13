const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");

// Images are decoded with pure JavaScript/WebAssembly libraries (no native binaries, installs anywhere).
// Videos and other formats go through ffmpeg. Libraries are loaded on first use so a broken install
// can only break /togif, never the whole bot.

const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024; // Discord's default upload limit for bots
// What resizing aims for: smaller GIFs start playing in Discord much sooner
const TARGET_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 640;
const MAX_CLIP_SECONDS = 30;
const DEFAULT_CLIP_SECONDS = 10;
const FFMPEG_TIMEOUT_MS = 120_000;
// Videos start at this size and shrink only as much as needed to fit the upload limit
const VIDEO_MAX_WIDTH = 480;
const VIDEO_FPS = 15;
const VIDEO_MIN_WIDTH = 160;
const VIDEO_ATTEMPTS = 4;
const TMP_DIR = path.join(__dirname, "..", "tmp");

const HEIF_BRANDS = ["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"];

// Reads the brands from an ISO media file header (used by MP4, MOV, HEIC, AVIF, 3GP...)
function ftypBrands(buffer) {
    const size = Math.min(buffer.readUInt32BE(0), buffer.length);
    const brands = [buffer.toString("ascii", 8, 12)];
    for (let i = 16; i + 4 <= size; i += 4) brands.push(buffer.toString("ascii", i, i + 4));
    return brands;
}

function detectFormat(buffer) {
    if (buffer.length < 12) return null;
    if (buffer[0] === 0x89 && buffer.toString("ascii", 1, 4) === "PNG") return "png";
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return "jpeg";
    if (buffer.toString("ascii", 0, 3) === "GIF") return "gif";
    if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
    if (buffer.toString("ascii", 4, 8) === "ftyp") {
        const brands = ftypBrands(buffer);
        if (brands.some(b => b === "avif" || b === "avis")) return "avif";
        if (brands.some(b => HEIF_BRANDS.includes(b))) return "heif";
        return "video";
    }
    return "other"; // WebM, MKV, AVI, BMP, TIFF... ffmpeg will try
}

// ---------- still images ----------

// The WebAssembly decoders return an ImageData, which only browsers have built in
function ensureImageData() {
    globalThis.ImageData ??= class ImageData {
        constructor(data, width, height) {
            Object.assign(this, { data, width, height });
        }
    };
}

const wasmDecoders = {};
async function decodeWithJsquash(name, buffer) {
    if (!wasmDecoders[name]) {
        ensureImageData();
        const { default: decode, init } = await import(`@jsquash/${name}/decode.js`);
        const wasmPath = require.resolve(`@jsquash/${name}/codec/dec/${name}_dec.wasm`);
        await init(await WebAssembly.compile(fs.readFileSync(wasmPath)));
        wasmDecoders[name] = decode;
    }
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length);
    return wasmDecoders[name](arrayBuffer);
}

// Returns { width, height, data } with RGBA pixels
async function decodeImage(buffer, format) {
    switch (format) {
        case "png":
            return require("pngjs").PNG.sync.read(buffer);
        case "jpeg":
            return require("jpeg-js").decode(buffer, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 100, maxMemoryUsageInMB: 512 });
        case "webp":
            return decodeWithJsquash("webp", buffer).catch(() => {
                throw new Error("Animated WebP images aren't supported. Try a still image.");
            });
        case "avif":
            return decodeWithJsquash("avif", buffer);
        case "heif":
            return require("heic-decode")({ buffer });
    }
}

// Box-filter downscale: averages every source pixel that falls into each target pixel
function resize(image, width, height) {
    if (width >= image.width && height >= image.height) return image;
    const out = new Uint8ClampedArray(width * height * 4);
    const xRatio = image.width / width;
    const yRatio = image.height / height;

    for (let y = 0; y < height; y++) {
        const y0 = Math.floor(y * yRatio);
        const y1 = Math.max(y0 + 1, Math.floor((y + 1) * yRatio));
        for (let x = 0; x < width; x++) {
            const x0 = Math.floor(x * xRatio);
            const x1 = Math.max(x0 + 1, Math.floor((x + 1) * xRatio));
            let r = 0, g = 0, b = 0, a = 0, n = 0;
            for (let sy = y0; sy < y1; sy++) {
                let i = (sy * image.width + x0) * 4;
                for (let sx = x0; sx < x1; sx++, i += 4) {
                    r += image.data[i];
                    g += image.data[i + 1];
                    b += image.data[i + 2];
                    a += image.data[i + 3];
                    n++;
                }
            }
            const o = (y * width + x) * 4;
            out[o] = r / n;
            out[o + 1] = g / n;
            out[o + 2] = b / n;
            out[o + 3] = a / n;
        }
    }
    return { width, height, data: out };
}

function encodeGif({ width, height, data }) {
    const { GIFEncoder, quantize, applyPalette } = require("gifenc");
    const palette = quantize(data, 256, { format: "rgba4444", oneBitAlpha: true });
    const index = applyPalette(data, palette, "rgba4444");
    const transparentIndex = palette.findIndex(color => color[3] === 0);

    const gif = GIFEncoder();
    gif.writeFrame(index, width, height, { palette, transparent: transparentIndex !== -1, transparentIndex: Math.max(transparentIndex, 0) });
    gif.finish();
    return Buffer.from(gif.bytes());
}

async function imageToGif(buffer, format) {
    const image = await decodeImage(buffer, format);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height));
    let width = Math.max(1, Math.round(image.width * scale));
    let height = Math.max(1, Math.round(image.height * scale));

    for (let attempt = 0; attempt < 5; attempt++) {
        const output = encodeGif(resize(image, width, height));
        if (output.length <= MAX_OUTPUT_BYTES) return output;
        width = Math.max(1, Math.round(width * 0.7));
        height = Math.max(1, Math.round(height * 0.7));
    }
    throw new Error("The GIF is still too large after shrinking it. Try a smaller image.");
}

// ---------- videos (ffmpeg) ----------

let ffmpegPath;
function findFfmpeg() {
    if (ffmpegPath !== undefined) return ffmpegPath;
    const candidates = [process.env.FFMPEG_PATH];
    try {
        candidates.push(require("ffmpeg-static"));
    } catch {}
    ffmpegPath = candidates.find(p => p && fs.existsSync(p)) || null;
    // Fall back to an ffmpeg installed on the system
    if (!ffmpegPath && spawnSync("ffmpeg", ["-version"]).status === 0) ffmpegPath = "ffmpeg";
    return ffmpegPath;
}

function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
        const proc = spawn(findFfmpeg(), args, { stdio: ["ignore", "pipe", "pipe"] });
        const chunks = [];
        let stderr = "";
        const timer = setTimeout(() => proc.kill("SIGKILL"), FFMPEG_TIMEOUT_MS);
        proc.stdout.on("data", chunk => chunks.push(chunk));
        proc.stderr.on("data", chunk => (stderr += chunk));
        proc.on("error", err => {
            clearTimeout(timer);
            reject(err);
        });
        proc.on("close", code => {
            clearTimeout(timer);
            if (code === 0) resolve(Buffer.concat(chunks));
            else reject(new Error(code === null ? "Conversion took too long." : stderr.trim().split("\n").pop() || `ffmpeg exited with ${code}`));
        });
    });
}

// Size for the next try, from how far over the target the last GIF was. GIF size grows
// with pixel count and frame rate, so shrink the width first and only drop frames when it gets small.
function nextVideoSize({ width, fps }, bytes) {
    const area = (TARGET_OUTPUT_BYTES / bytes) * 0.9;
    let nextWidth = width * Math.sqrt(area);
    let nextFps = fps;
    if (nextWidth < 320 && fps > 10) {
        nextFps = Math.max(10, Math.round(fps * 0.8));
        nextWidth = width * Math.sqrt(area * (fps / nextFps));
    }
    return { width: Math.max(VIDEO_MIN_WIDTH, Math.floor(Math.min(nextWidth, width - 16) / 2) * 2), fps: nextFps };
}

const ffmpegFailed = err => {
    if (err.message === "Conversion took too long.") return err;
    return new Error("I couldn't read that file. It may be corrupted or an unsupported format.");
};

async function videoToGif(buffer, { start, duration }) {
    if (!findFfmpeg()) throw new Error("Video conversion isn't available on this host (ffmpeg couldn't be installed).");

    fs.mkdirSync(TMP_DIR, { recursive: true });
    const id = crypto.randomUUID();
    const inputPath = path.join(TMP_DIR, `${id}.input`);
    const clipPath = path.join(TMP_DIR, `${id}.mkv`);
    fs.writeFileSync(inputPath, buffer);
    try {
        // Decode the source once: cut the clip, drop to the GIF frame rate and size, and remove grain
        // (noise makes GIFs much bigger). The lossless result is small, so retries below are cheap.
        await runFfmpeg([
            "-hide_banner", "-loglevel", "error",
            "-ss", String(start), "-t", String(duration),
            "-i", inputPath,
            "-an", "-sn",
            "-vf", `fps=${VIDEO_FPS},scale='min(${VIDEO_MAX_WIDTH},iw)':-2:flags=lanczos,hqdn3d=2:2:4:4`,
            "-c:v", "ffv1", "-y", clipPath,
        ]).catch(err => { throw ffmpegFailed(err); });

        let size = { width: VIDEO_MAX_WIDTH, fps: VIDEO_FPS };
        let usable = null; // last GIF that's over the target but still uploadable
        for (let attempt = 0; attempt < VIDEO_ATTEMPTS; attempt++) {
            const filter =
                `fps=${size.fps},scale='min(${size.width},iw)':-2:flags=lanczos,split[a][b];` +
                "[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle";
            const output = await runFfmpeg([
                "-hide_banner", "-loglevel", "error",
                "-i", clipPath,
                "-vf", filter, "-loop", "0", "-f", "gif", "pipe:1",
            ]).catch(err => { throw ffmpegFailed(err); });

            if (!output.length) throw new Error("No frames found. Is the start time past the end of the video?");
            if (output.length <= TARGET_OUTPUT_BYTES) return output;
            if (output.length <= MAX_OUTPUT_BYTES) usable = output;
            if (size.width <= VIDEO_MIN_WIDTH) break;
            size = nextVideoSize(size, output.length);
        }
        if (usable) return usable;
        throw new Error("The GIF is still too large after shrinking it. Try a shorter `length`.");
    } finally {
        fs.rm(inputPath, { force: true }, () => {});
        fs.rm(clipPath, { force: true }, () => {});
    }
}

// ---------- entry point ----------

// One conversion at a time keeps memory use predictable on small hosts
let queue = Promise.resolve();
function runExclusive(task) {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
}

// Converts an image or video to a GIF. GIFs are returned as-is so animations survive.
async function convertToGif(url, { start = 0, duration = DEFAULT_CLIP_SECONDS } = {}) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Couldn't download the file (HTTP ${res.status}).`);
    if (Number(res.headers.get("content-length")) > MAX_INPUT_BYTES) throw new Error("That file is too large (max 50 MB).");
    const input = Buffer.from(await res.arrayBuffer());
    if (input.length > MAX_INPUT_BYTES) throw new Error("That file is too large (max 50 MB).");

    const format = detectFormat(input);
    if (!format) throw new Error("That file is empty or not a supported image/video.");
    if (format === "gif") {
        if (input.length > MAX_OUTPUT_BYTES) throw new Error("That is already a GIF, and it's too large to re-upload.");
        return input;
    }

    const clip = { start: Math.max(0, start), duration: Math.min(Math.max(duration, 0.1), MAX_CLIP_SECONDS) };
    return runExclusive(() =>
        format === "video" || format === "other" ? videoToGif(input, clip) : imageToGif(input, format));
}

const MEDIA_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|heic|heif|bmp|tiff?|mp4|mov|m4v|webm|mkv|avi|3gp|3g2|wmv|flv|mpe?g)$/i;

// Finds the first image/video in a message: attachments first, then embeds (pasted links, Tenor/Giphy)
function findMediaUrl(message) {
    const attachment = message.attachments.find(a =>
        a.contentType?.startsWith("image/") || a.contentType?.startsWith("video/") || MEDIA_EXTENSIONS.test(a.name));
    if (attachment) return attachment.url;
    for (const embed of message.embeds) {
        const url = embed.video?.url || embed.image?.url || embed.thumbnail?.url;
        if (url) return url;
    }
    return null;
}

module.exports = { convertToGif, findMediaUrl, MAX_CLIP_SECONDS, DEFAULT_CLIP_SECONDS };
