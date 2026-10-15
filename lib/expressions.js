const { PermissionFlagsBits, StickerFormatType, AttachmentBuilder } = require("discord.js");
const { toStickerFile } = require("./stickerFile");

// Adding emoji and stickers copied from other servers (by mention, CDN link or ID) or made from a file

const EMOJI_MENTION = /<(a?):(\w{2,32}):(\d{17,20})>/;
const EMOJI_LINK = /(?:cdn\.discordapp\.com|media\.discordapp\.net)\/emojis\/(\d{17,20})\.(\w+)(\?\S*)?/i;
const STICKER_LINK = /(?:media|cdn)\.discord(?:app)?\.(?:net|com)\/stickers\/(\d{17,20})/i;
const SNOWFLAKE = /^\d{17,20}$/;
const EMOJI_MAX_BYTES = 256 * 1024;
const FILE_MAX_BYTES = 25 * 1024 * 1024;

// "<a:name:id>", a CDN link or a bare ID -> { id, name?, animated? }, or null
function parseEmojiSource(text) {
    const input = text.trim();
    const mention = input.match(EMOJI_MENTION);
    if (mention) return { id: mention[3], name: mention[2], animated: mention[1] === "a" };
    const link = input.match(EMOJI_LINK);
    if (link) return { id: link[1], animated: link[2].toLowerCase() === "gif" || /animated=true/i.test(link[3] ?? "") };
    return SNOWFLAKE.test(input) ? { id: input } : null;
}

// A sticker CDN link or ID -> the sticker ID, or null
function parseStickerSource(text) {
    const input = text.trim();
    return input.match(STICKER_LINK)?.[1] ?? (SNOWFLAKE.test(input) ? input : null);
}

// Emoji names: letters, numbers and underscores only (2-32), falling back when nothing usable is left
function cleanEmojiName(name, fallback) {
    const cleaned = (name ?? "").replace(/[^A-Za-z0-9_]/g, "_").slice(0, 32);
    return cleaned.length >= 2 && /[A-Za-z0-9]/.test(cleaned) ? cleaned : fallback;
}

// Sticker names can contain spaces and any letters (2-30)
function cleanStickerName(name, fallback) {
    const cleaned = (name ?? "").trim().slice(0, 30);
    return cleaned.length >= 2 ? cleaned : fallback;
}

const canAddExpressions = guild =>
    guild.members.me.permissions.has(PermissionFlagsBits.CreateGuildExpressions)
    || guild.members.me.permissions.has(PermissionFlagsBits.ManageGuildExpressions);
const NO_PERMISSION = { error: "❌ I need the **Create Expressions** permission for this." };

async function download(url, fetchImpl) {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
    return res?.ok ? Buffer.from(await res.arrayBuffer()) : null;
}

// Tries each URL in turn and returns the first file found
async function downloadFirst(urls, fetchImpl) {
    for (const url of urls) {
        const buffer = await download(url, fetchImpl);
        if (buffer) return { buffer, url };
    }
    return null;
}

async function addEmoji(interaction, source, name, fetchImpl = fetch) {
    const parsed = parseEmojiSource(source);
    if (!parsed) return { error: "❌ Give me a custom emoji, its ID, or its link. Built-in emoji like 😀 can't be added." };
    if (!canAddExpressions(interaction.guild)) return NO_PERMISSION;

    // Without the mention we don't know if it's animated, so try the GIF first
    const extensions = parsed.animated === false ? ["png"] : parsed.animated ? ["gif"] : ["gif", "png"];
    const file = await downloadFirst(extensions.map(ext => `https://cdn.discordapp.com/emojis/${parsed.id}.${ext}`), fetchImpl);
    if (!file) return { error: "❌ I couldn't find that emoji." };
    if (file.buffer.length > EMOJI_MAX_BYTES) return { error: "❌ That emoji is too big (over 256 KB)." };

    try {
        const emoji = await interaction.guild.emojis.create({
            attachment: file.buffer,
            name: cleanEmojiName(name ?? parsed.name, `emoji_${parsed.id.slice(-4)}`),
            reason: `Added by ${interaction.user.tag}`,
        });
        return { emoji };
    } catch (err) {
        if (err.code === 30008) return { error: "❌ This server has no free emoji slots." };
        return { error: `❌ Discord didn't accept that emoji: ${err.message}` };
    }
}

// Finds a sticker's image: its info (if Discord shares it with the bot), then the CDN
async function downloadSticker(client, id, fetchImpl) {
    const info = await client.fetchSticker(id).catch(() => null);
    if (info?.format === StickerFormatType.Lottie) return { error: "❌ That's one of Discord's built-in animated stickers, which can't be copied." };
    const extensions = info?.format === StickerFormatType.GIF ? ["gif"] : info ? ["png"] : ["gif", "png"];
    const file = await downloadFirst(extensions.map(ext => `https://media.discordapp.net/stickers/${id}.${ext}`), fetchImpl);
    if (!file) return { error: "❌ I couldn't find that sticker." };
    return { buffer: file.buffer, name: info?.name, tags: info?.tags };
}

// Adds a sticker from another server's sticker (`source`) or from an image/GIF/video (`fileUrl`)
async function addSticker(interaction, { source, fileUrl, name, tag }, fetchImpl = fetch) {
    if (!canAddExpressions(interaction.guild)) return NO_PERMISSION;

    let found;
    if (fileUrl) {
        const buffer = await download(fileUrl, fetchImpl);
        if (!buffer) return { error: "❌ I couldn't download that file." };
        if (buffer.length > FILE_MAX_BYTES) return { error: "❌ That file is too large." };
        found = { buffer };
    } else {
        const id = parseStickerSource(source ?? "");
        if (!id) return { error: "❌ Give me a sticker ID or link, or attach an image or GIF." };
        found = await downloadSticker(interaction.client, id, fetchImpl);
        if (found.error) return found;
    }

    let file;
    try {
        file = await toStickerFile(found.buffer);
    } catch (err) {
        return { error: `❌ ${err.message}` };
    }

    try {
        const sticker = await interaction.guild.stickers.create({
            file: new AttachmentBuilder(file.buffer, { name: `sticker.${file.ext}` }),
            name: cleanStickerName(name ?? found.name, "sticker"),
            tags: tag || found.tags || "star",
            reason: `Added by ${interaction.user.tag}`,
        });
        return { sticker };
    } catch (err) {
        if (err.code === 30039) return { error: "❌ This server has no free sticker slots." };
        return { error: `❌ Discord didn't accept that sticker: ${err.message}` };
    }
}

module.exports = { parseEmojiSource, parseStickerSource, addEmoji, addSticker, downloadSticker };
