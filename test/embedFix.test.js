const { describe, test, expect, mock } = require("bun:test");
const { PermissionsBitField, PermissionFlagsBits: P } = require("discord.js");
const { fixLinks, PLATFORMS, settingsFrom, orderFor, switchService } = require("../lib/embedFix");
const embedFixEvent = require("../events/embedFix");
const setup = require("../commands/setup");
const { getGuildConfig, updateGuildConfig } = require("../lib/guildConfig");
const { fakeGuild, fakeInteraction } = require("./fakes");
const { rowsOf, expectWithinDiscordLimits } = require("./limits");

const twitter = PLATFORMS.find(p => p.id === "twitter");

describe("fixLinks", () => {
    test("rewrites each platform to its first service by default", () => {
        expect(fixLinks("look https://x.com/user/status/1 and https://www.tiktok.com/@a/video/2", {})).toEqual([
            "https://fxtwitter.com/user/status/1",
            "https://tnktok.com/@a/video/2",
        ]);
    });

    test("uses the first service in the server's order and skips platforms switched off", () => {
        const settings = { order: { twitter: ["vxtwitter.com", "fxtwitter.com"] }, off: ["instagram"] };
        expect(fixLinks("https://twitter.com/a/status/1 https://www.instagram.com/reel/abc/", settings))
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

describe("service order", () => {
    test("the order always holds every service, even ones added later", () => {
        expect(orderFor(twitter, { order: { twitter: ["fixvx.com", "gone.example"] } }))
            .toEqual(["fixvx.com", "fxtwitter.com", "fixupx.com", "vxtwitter.com"]);
    });

    test("settings saved by the old single-choice version still work", () => {
        const settings = settingsFrom({ embedFixServices: { twitter: "vxtwitter.com", tiktok: "off" } });
        expect(orderFor(twitter, settings)[0]).toBe("vxtwitter.com");
        expect(settings.off).toEqual(["tiktok"]);
    });

    test("switching a reply's service keeps spoilers, other links and short-link subdomains", () => {
        const content = "||https://fxtwitter.com/a/status/1||\nhttps://vm.tnktok.com/ZMabc/";
        expect(switchService(content, "twitter", "vxtwitter.com")).toBe("||https://vxtwitter.com/a/status/1||\nhttps://vm.tnktok.com/ZMabc/");
        expect(switchService(content, "tiktok", "vxtiktok.com")).toBe("||https://fxtwitter.com/a/status/1||\nhttps://vm.vxtiktok.com/ZMabc/");
    });
});

function message(guild, content, { canManage = true } = {}) {
    return {
        content,
        inGuild: () => true,
        author: { bot: false, id: "poster" },
        guild,
        channelId: "general",
        channel: { permissionsFor: () => new PermissionsBitField(canManage ? P.Administrator : P.SendMessages) },
        reply: mock(async () => {}),
        suppressEmbeds: mock(async () => {}),
    };
}

describe("the embed fix event", () => {
    test("replies with fixed links, a service menu per platform, and hides the original embed", async () => {
        const guild = fakeGuild();
        updateGuildConfig(guild.id, { embedFix: true, embedFixHide: true });
        const msg = message(guild, "https://x.com/a/status/1");
        await embedFixEvent.execute(msg);
        const reply = msg.reply.mock.calls[0][0];
        expect(reply.content).toBe("https://fxtwitter.com/a/status/1");
        expect(reply.allowedMentions).toEqual({ parse: [], repliedUser: false });
        const menu = reply.components[0].toJSON().components[0];
        expect(menu.custom_id).toBe("embedfix:switch:twitter:poster");
        expect(menu.options.map(o => o.value)).toEqual(["fxtwitter.com", "fixupx.com", "vxtwitter.com", "fixvx.com"]);
        expect(menu.options.find(o => o.default).value).toBe("fxtwitter.com");
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

describe("switching from the reply", () => {
    function switchClick(userId, host) {
        const interaction = fakeInteraction({ customId: "embedfix:switch:twitter:poster", values: [host] });
        interaction.user = { id: userId };
        interaction.message = { content: "https://fxtwitter.com/a/status/1" };
        return interaction;
    }

    test("the poster can switch the service", async () => {
        const interaction = switchClick("poster", "vxtwitter.com");
        await embedFixEvent.handleComponent(interaction);
        const payload = interaction.update.mock.calls[0][0];
        expect(payload.content).toBe("https://vxtwitter.com/a/status/1");
        expect(payload.components[0].toJSON().components[0].options.find(o => o.default).value).toBe("vxtwitter.com");
    });

    test("anyone else is told no", async () => {
        const interaction = switchClick("someone", "vxtwitter.com");
        await embedFixEvent.handleComponent(interaction);
        expect(interaction.update).not.toHaveBeenCalled();
        expect(interaction.reply.mock.calls[0][0].content).toBe("❌ Only the person who posted the link can change its service.");
    });

    test("an unknown service is ignored", async () => {
        const interaction = switchClick("poster", "evil.example");
        await embedFixEvent.handleComponent(interaction);
        expect(interaction.update).not.toHaveBeenCalled();
        expect(interaction.reply.mock.calls[0][0].content).toBe("❌ That service isn't available anymore.");
    });
});

describe("link embeds section", () => {
    const update = interaction => interaction.update.mock.calls.at(-1)[0];

    test("a platform's services can be moved to the top", async () => {
        const guild = fakeGuild();
        const pick = fakeInteraction({ guild, customId: "setup:embeds:platform", values: ["tiktok"] });
        await setup.handleComponent(pick);
        expect(rowsOf(update(pick))[1].components[0].custom_id).toBe("setup:embeds:first:tiktok");
        expectWithinDiscordLimits(update(pick));

        const move = fakeInteraction({ guild, customId: "setup:embeds:first:tiktok", values: ["vxtiktok.com"] });
        await setup.handleComponent(move);
        expect(getGuildConfig(guild.id).embedFixOrder.tiktok).toEqual(["vxtiktok.com", "tnktok.com", "tiktxk.com"]);
        expect(update(move).content).toBe("✅ TikTok: vxTikTok → tnktok → tiktxk");
    });

    test("a platform can be switched off and on", async () => {
        const guild = fakeGuild();
        await setup.handleComponent(fakeInteraction({ guild, customId: "setup:embeds:platformtoggle:tiktok" }));
        expect(getGuildConfig(guild.id).embedFixOff).toEqual(["tiktok"]);
        await setup.handleComponent(fakeInteraction({ guild, customId: "setup:embeds:platformtoggle:tiktok" }));
        expect(getGuildConfig(guild.id).embedFixOff).toBeUndefined();
    });

    test("the toggles turn link fixing and hiding on and off", async () => {
        const guild = fakeGuild();
        await setup.handleComponent(fakeInteraction({ guild, customId: "setup:embeds:toggle" }));
        await setup.handleComponent(fakeInteraction({ guild, customId: "setup:embeds:hide" }));
        expect(getGuildConfig(guild.id)).toMatchObject({ embedFix: true, embedFixHide: true });
    });

    test("an unknown service is out of date", async () => {
        const interaction = fakeInteraction({ customId: "setup:embeds:first:tiktok", values: ["evil.example"] });
        await setup.handleComponent(interaction);
        expect(interaction.reply.mock.calls[0][0].content).toBe("⚠️ This dashboard is out of date. Run /setup again.");
    });
});
