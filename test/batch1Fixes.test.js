const { describe, test, expect, mock } = require("bun:test");
const { Collection, PermissionsBitField, PermissionFlagsBits: P } = require("discord.js");
const setup = require("../commands/setup");
const actions = require("../lib/modActions");
const { checkAssignableRole } = require("../lib/moderation");
const { hasChannelAccess, COMMAND_KEYS } = require("../lib/access");
const { fixLinks } = require("../lib/embedFix");
const embedFixEvent = require("../events/embedFix");
const automodEvent = require("../events/automod");
const memberJoin = require("../events/memberJoin");
const prefixCommands = require("../events/prefixCommands");
const { parseEmojiSource } = require("../lib/expressions");
const { toStickerFile } = require("../lib/stickerFile");
const { getHistory } = require("../lib/modHistory");
const { getGuildConfig, updateGuildConfig } = require("../lib/guildConfig");
const { fakeGuild, fakeChannel, fakeRole, fakeMember, fakeInteraction } = require("./fakes");
const { rowsOf } = require("./limits");

// A bot mod (role "modrole") with no Discord permissions of their own
function asMod(interaction) {
    interaction.memberPermissions = new PermissionsBitField(0n);
    interaction.member = { roles: { highest: { position: 50 }, cache: new Collection([["modrole", {}]]) } };
    updateGuildConfig(interaction.guild.id, { botMods: [{ type: "role", id: "modrole", blocked: [] }] });
    return interaction;
}

describe("bot mod safety", () => {
    test("a bot mod can't hand out a role with permissions they lack", () => {
        const interaction = asMod(fakeInteraction());
        const staff = { ...fakeRole(), permissions: new PermissionsBitField(P.BanMembers) };
        expect(checkAssignableRole(interaction, staff)).toBe(`❌ <@&${staff.id}> has permissions you don't have.`);
        const plain = { ...fakeRole(), permissions: new PermissionsBitField(0n) };
        expect(checkAssignableRole(interaction, plain)).toBeNull();
    });

    test("a bot mod can't change their own roles", async () => {
        const interaction = asMod(fakeInteraction());
        const self = fakeMember({ id: "moderator" });
        const result = await actions.changeRoles(interaction, self, [{ ...fakeRole(), permissions: new PermissionsBitField(0n) }], true);
        expect(result).toEqual({ error: "❌ Bot mods can't change their own roles." });
    });

    test("bot mods still need to see the channel for channel tools", () => {
        const interaction = asMod(fakeInteraction());
        const hidden = fakeChannel("secret");
        hidden.permissionsFor = () => new PermissionsBitField(0n);
        expect(hasChannelAccess(interaction, hidden, P.ManageMessages, "purge")).toBe(false);
        const visible = fakeChannel("open");
        visible.permissionsFor = () => new PermissionsBitField(P.ViewChannel);
        expect(hasChannelAccess(interaction, visible, P.ManageMessages, "purge")).toBe(true);
    });

    test("the bot mods section explains the limit for mod users", () => {
        const view = require("../lib/setup/sections/botmods").view(fakeInteraction());
        expect(view.embeds[0].toJSON().description).toContain("Mod users can't act on anyone whose top role is at or above their own");
    });

    test("the newer /setup sections can be blocked one by one, in two menus", async () => {
        expect(COMMAND_KEYS).toContain("joinwhitelist");
        const guild = fakeGuild();
        updateGuildConfig(guild.id, { botMods: [{ type: "user", id: "u1", blocked: [] }] });
        const view = require("../lib/setup/sections/botmods").view(fakeInteraction({ guild }), undefined, "u-u1");
        const menus = rowsOf(view).filter(r => r.components[0].type === 3).map(r => r.components[0]);
        expect(menus).toHaveLength(2);
        for (const menu of menus) expect(menu.options.length).toBeLessThanOrEqual(25);

        await setup.handleComponent(fakeInteraction({ guild, customId: "setup:botmods:blocksetup:u-u1", values: ["joinwhitelist"] }));
        await setup.handleComponent(fakeInteraction({ guild, customId: "setup:botmods:blockcommands:u-u1", values: ["ban"] }));
        expect(getGuildConfig(guild.id).botMods[0].blocked.sort()).toEqual(["ban", "joinwhitelist"]);
    });
});

describe("link embeds", () => {
    test("spoilered links stay spoilered", () => {
        expect(fixLinks("||https://x.com/a/status/123||", {})).toEqual(["||https://fxtwitter.com/a/status/123||"]);
    });

    test("trailing punctuation and code spans", () => {
        expect(fixLinks("(https://x.com/a/status/1). also https://x.com/b/status/2!", {}))
            .toEqual(["https://fxtwitter.com/a/status/1", "https://fxtwitter.com/b/status/2"]);
        expect(fixLinks("`https://x.com/a/status/1` and ```\nhttps://x.com/b/status/2\n```", {})).toEqual([]);
    });

    test("np.reddit and services that were removed fall back sensibly", () => {
        expect(fixLinks("https://np.reddit.com/r/a/comments/b/", {})).toEqual(["https://rxddit.com/r/a/comments/b/"]);
        expect(fixLinks("https://x.com/a/status/1", { twitter: "dead.example" })).toEqual(["https://fxtwitter.com/a/status/1"]);
    });

    function linkMessage(guild, { manage = false, replyFails = false } = {}) {
        return {
            content: "https://x.com/a/status/1",
            inGuild: () => true,
            author: { bot: false },
            member: { permissions: new PermissionsBitField(manage ? P.ManageMessages : 0n) },
            guild,
            channelId: "general",
            channel: { permissionsFor: () => new PermissionsBitField(P.Administrator) },
            reply: mock(async () => { if (replyFails) throw new Error("Missing Permissions"); }),
            suppressEmbeds: mock(async () => {}),
        };
    }

    test("links that automod removes aren't reposted", async () => {
        const guild = fakeGuild();
        updateGuildConfig(guild.id, { embedFix: true, automodLinks: true });
        const msg = linkMessage(guild);
        await embedFixEvent.execute(msg);
        expect(msg.reply).not.toHaveBeenCalled();
        const staff = linkMessage(guild, { manage: true });
        await embedFixEvent.execute(staff);
        expect(staff.reply).toHaveBeenCalled();
    });

    test("the original embed is only hidden when the reply worked", async () => {
        const guild = fakeGuild();
        updateGuildConfig(guild.id, { embedFix: true, embedFixHide: true });
        const msg = linkMessage(guild, { replyFails: true });
        await embedFixEvent.execute(msg);
        expect(msg.suppressEmbeds).not.toHaveBeenCalled();
    });
});

describe("join whitelist", () => {
    function joining(guild, options = {}) {
        const member = fakeMember({ id: "123456789012345678", ...options });
        member.guild = guild;
        member.user.createdTimestamp = Date.now();
        return member;
    }

    test("logs a warning when it can't kick", async () => {
        const logs = fakeChannel("logs");
        const guild = fakeGuild({ channels: [logs] });
        updateGuildConfig(guild.id, { joinWhitelist: true, joinWhitelistIds: ["111111111111111111"], logChannelId: "logs" });
        await memberJoin.execute(joining(guild, { kickable: false }));
        expect(logs.send.mock.calls[0][0].embeds[0].toJSON().title).toBe("⚠️ Join whitelist couldn't kick someone");
    });

    test("a failed kick isn't recorded as a kick", async () => {
        const guild = fakeGuild();
        updateGuildConfig(guild.id, { joinWhitelist: true, joinWhitelistIds: ["111111111111111111"] });
        const member = joining(guild);
        member.kick = mock(async () => { throw new Error("Missing Permissions"); });
        await memberJoin.execute(member);
        expect(getHistory(guild.id)).toEqual([]);
    });

    test("whitelisted new accounts aren't kicked by the account age rule", async () => {
        const guild = fakeGuild();
        updateGuildConfig(guild.id, { joinWhitelist: true, joinWhitelistIds: ["123456789012345678"], automodMinAccountAgeDays: 7 });
        const member = joining(guild);
        await memberJoin.execute(member);
        expect(member.kick).not.toHaveBeenCalled();
    });
});

test("every invite in a message is checked against the allowlist", async () => {
    const guild = fakeGuild();
    updateGuildConfig(guild.id, { automodInvites: true, automodInviteAllow: [{ id: "222222222222222222", name: "Friends" }] });
    const message = {
        id: "m1",
        content: "discord.gg/friends discord.gg/scam",
        inGuild: () => true,
        author: { bot: false, tag: "u#1", id: "u1", toString: () => "<@u1>" },
        member: { permissions: new PermissionsBitField(0n), moderatable: false },
        guild,
        channelId: "general",
        channel: { send: mock(async () => null), toString: () => "<#general>" },
        client: { fetchInvite: mock(async code => ({ guild: { id: code === "friends" ? "222222222222222222" : "333333333333333333" } })) },
        delete: mock(async () => {}),
    };
    await automodEvent.execute(message);
    expect(message.delete).toHaveBeenCalled();
});

describe("prefix commands", () => {
    test("a letter prefix works in any case", async () => {
        const guild = fakeGuild();
        updateGuildConfig(guild.id, { prefix: "s!" });
        const msg = { content: "S!coin", author: { bot: false }, guild, inGuild: () => true, channel: { send: mock(async () => {}) } };
        await prefixCommands.execute(msg);
        expect(msg.channel.send).toHaveBeenCalled();
    });

    test("!say respects bot mod blocks", async () => {
        const guild = fakeGuild();
        updateGuildConfig(guild.id, { botMods: [{ type: "role", id: "modrole", blocked: ["say"] }] });
        const msg = {
            content: "!say hello",
            author: { bot: false, id: "u1" },
            guild,
            inGuild: () => true,
            member: { permissions: new PermissionsBitField(P.ManageMessages), roles: { cache: new Collection([["modrole", {}]]) } },
            mentions: { channels: new Collection() },
            channel: { send: mock(async () => {}) },
            reply: mock(async () => {}),
            delete: mock(async () => {}),
        };
        await prefixCommands.execute(msg);
        expect(msg.channel.send).not.toHaveBeenCalled();
        expect(msg.reply).toHaveBeenCalledWith("🔒 You're blocked from using this command here.");
    });
});

describe("expressions", () => {
    test("emoji links from the media proxy are accepted", () => {
        expect(parseEmojiSource("https://media.discordapp.net/emojis/123456789012345678.webp?animated=true"))
            .toEqual({ id: "123456789012345678", animated: true });
    });

    test("a cut-off PNG gives a clear error", async () => {
        await expect(toStickerFile(Buffer.concat([Buffer.from([0x89]), Buffer.from("PNG\r\n\x1a\n0000")]))).rejects
            .toThrow("That file is empty or not a supported image.");
    });
});
