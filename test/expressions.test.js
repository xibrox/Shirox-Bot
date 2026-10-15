const { describe, test, expect, mock } = require("bun:test");
const { PNG } = require("pngjs");
const { PermissionFlagsBits: P, StickerFormatType } = require("discord.js");
const { parseEmojiSource, parseStickerSource, addEmoji, addSticker } = require("../lib/expressions");
const { toStickerFile, stickerToGif } = require("../lib/stickerFile");
const { findFfmpeg } = require("../lib/gif");
const { fakeGuild, fakeInteraction } = require("./fakes");

const GIF_BYTES = Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;", "binary");

function png(width, height) {
    const image = new PNG({ width, height });
    image.data.fill(200);
    return PNG.sync.write(image);
}

// A fetch that answers only the URLs given, like the Discord CDN
function fakeFetch(responses) {
    return mock(async url => {
        const body = responses[url];
        return body ? { ok: true, status: 200, arrayBuffer: async () => body } : { ok: false, status: 415 };
    });
}

function withExpressions(interaction) {
    interaction.guild.emojis = { create: mock(async ({ name }) => ({ name, toString: () => `<:${name}:1>` })) };
    interaction.guild.stickers = { create: mock(async ({ name }) => ({ name })) };
    interaction.client.fetchSticker = mock(async () => { throw new Error("Unknown Sticker"); });
    return interaction;
}

describe("parsing", () => {
    test("emoji from a mention, a link or an ID", () => {
        expect(parseEmojiSource("<a:dance:123456789012345678>")).toEqual({ id: "123456789012345678", name: "dance", animated: true });
        expect(parseEmojiSource("<:smile:123456789012345678>")).toEqual({ id: "123456789012345678", name: "smile", animated: false });
        expect(parseEmojiSource("https://cdn.discordapp.com/emojis/123456789012345678.gif?size=48")).toEqual({ id: "123456789012345678", animated: true });
        expect(parseEmojiSource(" 123456789012345678 ")).toEqual({ id: "123456789012345678" });
        expect(parseEmojiSource("😀")).toBeNull();
    });

    test("sticker from a link or an ID", () => {
        expect(parseStickerSource("https://media.discordapp.net/stickers/123456789012345678.png?size=160")).toBe("123456789012345678");
        expect(parseStickerSource("123456789012345678")).toBe("123456789012345678");
        expect(parseStickerSource("nope")).toBeNull();
    });
});

describe("addEmoji", () => {
    test("adds an animated emoji under its own name", async () => {
        const interaction = withExpressions(fakeInteraction());
        const fetchImpl = fakeFetch({ "https://cdn.discordapp.com/emojis/123456789012345678.gif": GIF_BYTES });
        const result = await addEmoji(interaction, "<a:dance:123456789012345678>", null, fetchImpl);
        expect(result.error).toBeUndefined();
        expect(interaction.guild.emojis.create.mock.calls[0][0]).toMatchObject({ name: "dance" });
    });

    test("an ID falls back to the still image when there's no GIF", async () => {
        const interaction = withExpressions(fakeInteraction());
        const fetchImpl = fakeFetch({ "https://cdn.discordapp.com/emojis/123456789012345678.png": png(64, 64) });
        await addEmoji(interaction, "123456789012345678", "my emoji!", fetchImpl);
        expect(interaction.guild.emojis.create.mock.calls[0][0]).toMatchObject({ name: "my_emoji_" });
    });

    test("explains what went wrong", async () => {
        expect(await addEmoji(withExpressions(fakeInteraction()), "😀", null, fakeFetch({}))).toEqual({
            error: "❌ Give me a custom emoji, its ID, or its link. Built-in emoji like 😀 can't be added.",
        });
        const noPerms = withExpressions(fakeInteraction({ guild: fakeGuild({ botPermissions: P.KickMembers }) }));
        expect(await addEmoji(noPerms, "123456789012345678", null, fakeFetch({}))).toEqual({ error: "❌ I need the **Create Expressions** permission for this." });
        expect(await addEmoji(withExpressions(fakeInteraction()), "123456789012345678", null, fakeFetch({}))).toEqual({ error: "❌ I couldn't find that emoji." });

        const full = withExpressions(fakeInteraction());
        full.guild.emojis.create = mock(async () => { throw Object.assign(new Error("Maximum number of emojis reached"), { code: 30008 }); });
        const fetchImpl = fakeFetch({ "https://cdn.discordapp.com/emojis/123456789012345678.gif": GIF_BYTES });
        expect(await addEmoji(full, "123456789012345678", null, fetchImpl)).toEqual({ error: "❌ This server has no free emoji slots." });
    });
});

describe("addSticker", () => {
    test("built-in animated Discord stickers can't be copied", async () => {
        const interaction = withExpressions(fakeInteraction());
        interaction.client.fetchSticker = mock(async () => ({ id: "1", name: "Wave", format: StickerFormatType.Lottie }));
        expect(await addSticker(interaction, { source: "123456789012345678" }, fakeFetch({})))
            .toEqual({ error: "❌ That's one of Discord's built-in animated stickers, which can't be copied." });
    });

    test("a sticker ID with a GIF on the CDN is added", async () => {
        const interaction = withExpressions(fakeInteraction());
        interaction.client.fetchSticker = mock(async () => ({ id: "1", name: "Party", tags: "tada", format: StickerFormatType.GIF }));
        const fetchImpl = fakeFetch({ "https://media.discordapp.net/stickers/123456789012345678.gif": GIF_BYTES });
        const result = await addSticker(interaction, { source: "123456789012345678" }, fetchImpl);
        expect(result.error).toBeUndefined();
        expect(interaction.guild.stickers.create.mock.calls[0][0]).toMatchObject({ name: "Party", tags: "tada" });
    });
});

describe.skipIf(!findFfmpeg())("sticker files (ffmpeg)", () => {
    test("a large image becomes a 320x320 GIF under 512 KB", async () => {
        const { buffer, ext } = await toStickerFile(png(800, 400));
        expect(ext).toBe("gif");
        expect(buffer.length).toBeLessThanOrEqual(512 * 1024);
        expect([buffer.readUInt16LE(6), buffer.readUInt16LE(8)]).toEqual([320, 320]);
    });

    test("a small PNG is kept as it is", async () => {
        const input = png(320, 320);
        expect(await toStickerFile(input)).toEqual({ buffer: input, ext: "png" });
    });

    test("a PNG sticker turns into a GIF", async () => {
        const gif = await stickerToGif(png(160, 160));
        expect(gif.toString("ascii", 0, 3)).toBe("GIF");
    });
});
