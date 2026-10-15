const { describe, test, expect, mock } = require("bun:test");
const { PermissionsBitField, PermissionFlagsBits: P } = require("discord.js");
const { fixLinks, PLATFORMS } = require("../lib/embedFix");
const embedFixEvent = require("../events/embedFix");
const setup = require("../commands/setup");
const { getGuildConfig, updateGuildConfig } = require("../lib/guildConfig");
const { fakeGuild, fakeInteraction } = require("./fakes");
const { rowsOf } = require("./limits");

describe("fixLinks", () => {
    test("rewrites each platform to its first service by default", () => {
        expect(fixLinks("look https://x.com/user/status/1 and https://www.tiktok.com/@a/video/2", {})).toEqual([
            "https://fxtwitter.com/user/status/1",
            "https://tnktok.com/@a/video/2",
        ]);
    });

    test("uses the chosen service and skips platforms switched off", () => {
        const choices = { twitter: "vxtwitter.com", instagram: "off" };
        expect(fixLinks("https://twitter.com/a/status/1 https://www.instagram.com/reel/abc/", choices))
            .toEqual(["https://vxtwitter.com/a/status/1"]);
    });

    test("keeps short-link subdomains and query strings", () => {
        expect(fixLinks("https://vm.tiktok.com/ZMabc/?x=1", {})).toEqual(["https://vm.tnktok.com/ZMabc/?x=1"]);
        expect(fixLinks("https://old.reddit.com/r/a/comments/b/", {})).toEqual(["https://rxddit.com/r/a/comments/b/"]);
    });

    test("ignores links wrapped in <> and unknown sites", () => {
        expect(fixLinks("<https://x.com/a/status/1> https://example.com/x", {})).toEqual([]);
    });

    test("ignores profile pages without a post", () => {
        expect(fixLinks("https://x.com/someone", {})).toEqual([]);
    });

    test("every platform has at least one service", () => {
        for (const platform of PLATFORMS) expect(platform.services.length).toBeGreaterThan(0);
    });
});

function message(guild, content, { canManage = true } = {}) {
    return {
        content,
        inGuild: () => true,
        author: { bot: false },
        guild,
        channelId: "general",
        channel: { permissionsFor: () => new PermissionsBitField(canManage ? P.Administrator : P.SendMessages) },
        reply: mock(async () => {}),
        suppressEmbeds: mock(async () => {}),
    };
}

describe("the embed fix event", () => {
    test("replies with fixed links and hides the original embed", async () => {
        const guild = fakeGuild();
        updateGuildConfig(guild.id, { embedFix: true, embedFixHide: true });
        const msg = message(guild, "https://x.com/a/status/1");
        await embedFixEvent.execute(msg);
        expect(msg.reply).toHaveBeenCalledWith({ content: "https://fxtwitter.com/a/status/1", allowedMentions: { parse: [], repliedUser: false } });
        expect(msg.suppressEmbeds).toHaveBeenCalledWith(true);
    });

    test("does nothing while off", async () => {
        const msg = message(fakeGuild(), "https://x.com/a/status/1");
        await embedFixEvent.execute(msg);
        expect(msg.reply).not.toHaveBeenCalled();
    });

    test("doesn't hide embeds without Manage Messages", async () => {
        const guild = fakeGuild();
        updateGuildConfig(guild.id, { embedFix: true, embedFixHide: true });
        const msg = message(guild, "https://x.com/a/status/1", { canManage: false });
        await embedFixEvent.execute(msg);
        expect(msg.reply).toHaveBeenCalled();
        expect(msg.suppressEmbeds).not.toHaveBeenCalled();
    });
});

describe("link embeds section", () => {
    const update = interaction => interaction.update.mock.calls.at(-1)[0];

    test("picking a platform shows its services, and picking one saves it", async () => {
        const guild = fakeGuild();
        const pick = fakeInteraction({ guild, customId: "setup:embeds:platform", values: ["tiktok"] });
        await setup.handleComponent(pick);
        const serviceMenu = rowsOf(update(pick))[1].components[0];
        expect(serviceMenu.custom_id).toBe("setup:embeds:service:tiktok");
        expect(serviceMenu.options.map(o => o.value)).toContain("off");

        const choose = fakeInteraction({ guild, customId: "setup:embeds:service:tiktok", values: ["vxtiktok.com"] });
        await setup.handleComponent(choose);
        expect(getGuildConfig(guild.id).embedFixServices).toEqual({ tiktok: "vxtiktok.com" });
    });

    test("the toggles turn link fixing and hiding on and off", async () => {
        const guild = fakeGuild();
        await setup.handleComponent(fakeInteraction({ guild, customId: "setup:embeds:toggle" }));
        await setup.handleComponent(fakeInteraction({ guild, customId: "setup:embeds:hide" }));
        expect(getGuildConfig(guild.id)).toMatchObject({ embedFix: true, embedFixHide: true });
    });

    test("an unknown service is out of date", async () => {
        const interaction = fakeInteraction({ customId: "setup:embeds:service:tiktok", values: ["evil.example"] });
        await setup.handleComponent(interaction);
        expect(interaction.reply.mock.calls[0][0].content).toBe("⚠️ This dashboard is out of date. Run /setup again.");
    });
});
