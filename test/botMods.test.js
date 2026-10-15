const { describe, test, expect } = require("bun:test");
const { Collection, PermissionFlagsBits: P } = require("discord.js");
const { hasAccess, isBlocked, COMMAND_KEYS } = require("../lib/access");
const setup = require("../commands/setup");
const mod = require("../commands/mod");
const { getGuildConfig, updateGuildConfig } = require("../lib/guildConfig");
const { fakeGuild, fakeMember, fakeInteraction } = require("./fakes");
const { rowsOf } = require("./limits");

const update = interaction => interaction.update.mock.calls.at(-1)[0];

// A member with no Discord moderation permissions who has the role "modrole"
function asMod(interaction) {
    interaction.member = { roles: { highest: { position: 50 }, cache: new Collection([["modrole", {}]]) } };
    return interaction;
}

describe("access rules", () => {
    test("admins can do everything, even when blocked", () => {
        const interaction = fakeInteraction({ permissions: P.Administrator });
        updateGuildConfig(interaction.guild.id, { botMods: [{ type: "user", id: "moderator", blocked: ["ban"] }] });
        expect(hasAccess(interaction, P.BanMembers, "ban")).toBe(true);
        expect(isBlocked(interaction, "ban")).toBe(false);
    });

    test("without mod entries, Discord permissions decide", () => {
        const interaction = fakeInteraction({ permissions: P.KickMembers });
        expect(hasAccess(interaction, P.KickMembers, "kick")).toBe(true);
        expect(hasAccess(interaction, P.BanMembers, "ban")).toBe(false);
    });

    test("bot mods get access except to blocked commands and admin-only things", () => {
        const interaction = asMod(fakeInteraction({ permissions: 0n }));
        updateGuildConfig(interaction.guild.id, { botMods: [{ type: "role", id: "modrole", blocked: ["ban"] }] });
        expect(hasAccess(interaction, P.KickMembers, "kick")).toBe(true);
        expect(hasAccess(interaction, P.BanMembers, "ban")).toBe(false);
        expect(hasAccess(interaction, P.Administrator, "honeypot")).toBe(false);
        expect(isBlocked(interaction, "ban")).toBe(true);
        expect(isBlocked(interaction, "kick")).toBe(false);
    });

    test("a block also applies to mods who have the Discord permission", () => {
        const interaction = fakeInteraction({ permissions: P.BanMembers });
        updateGuildConfig(interaction.guild.id, { botMods: [{ type: "user", id: "moderator", blocked: ["ban"] }] });
        expect(hasAccess(interaction, P.BanMembers, "ban")).toBe(false);
    });

    test("with two mod roles, one that allows a command is enough", () => {
        const interaction = asMod(fakeInteraction({ permissions: 0n }));
        interaction.member.roles.cache.set("helper", {});
        updateGuildConfig(interaction.guild.id, {
            botMods: [{ type: "role", id: "modrole", blocked: ["ban"] }, { type: "role", id: "helper", blocked: [] }],
        });
        expect(hasAccess(interaction, P.BanMembers, "ban")).toBe(true);
    });

    test("every command key fits in one menu", () => {
        expect(COMMAND_KEYS.length).toBeLessThanOrEqual(25);
    });
});

describe("panels respect bot mods", () => {
    test("a bot mod can open /setup sections without Manage Server, except blocked ones", () => {
        const interaction = asMod(fakeInteraction({ permissions: 0n }));
        updateGuildConfig(interaction.guild.id, { botMods: [{ type: "role", id: "modrole", blocked: ["welcome"] }] });
        const ids = rowsOf(setup.homeView(interaction))[0].components[0].options.map(o => o.value);
        expect(ids).toContain("logs");
        expect(ids).not.toContain("welcome");
        expect(ids).not.toContain("honeypot");
        expect(ids).not.toContain("botmods");
    });

    test("a bot mod sees /mod buttons for commands they aren't blocked from", async () => {
        const member = fakeMember();
        const guild = fakeGuild({ members: [member] });
        const interaction = asMod(fakeInteraction({ guild, permissions: 0n, customId: `mod:user:show:${member.id}` }));
        interaction.client.users = { fetch: async () => member.user };
        updateGuildConfig(guild.id, { botMods: [{ type: "role", id: "modrole", blocked: ["ban"] }] });
        await mod.handleComponent(interaction);
        const ids = rowsOf(update(interaction)).flatMap(r => r.components.map(c => c.custom_id));
        expect(ids).toContain(`mod:user:kick:${member.id}`);
        expect(ids).not.toContain(`mod:user:ban:${member.id}`);
    });

    test("a blocked /mod action is refused from a stale panel", async () => {
        const member = fakeMember();
        const guild = fakeGuild({ members: [member] });
        const interaction = asMod(fakeInteraction({ guild, permissions: 0n, customId: `mod:user:ban:${member.id}` }));
        updateGuildConfig(guild.id, { botMods: [{ type: "role", id: "modrole", blocked: ["ban"] }] });
        await mod.handleComponent(interaction);
        expect(interaction.reply.mock.calls[0][0].content).toBe("❌ You need **Ban Members** for this.");
    });
});

describe("bot mods section", () => {
    test("is for admins only", () => {
        const ids = rowsOf(setup.homeView(fakeInteraction({ permissions: P.ManageGuild })))[0].components[0].options.map(o => o.value);
        expect(ids).not.toContain("botmods");
    });

    test("adding roles and users, then blocking commands", async () => {
        const guild = fakeGuild();
        await setup.handleComponent(fakeInteraction({ guild, customId: "setup:botmods:addroles", values: ["r1", guild.id] }));
        await setup.handleComponent(fakeInteraction({ guild, customId: "setup:botmods:addusers", values: ["u1"] }));
        expect(getGuildConfig(guild.id).botMods).toEqual([{ type: "role", id: "r1", blocked: [] }, { type: "user", id: "u1", blocked: [] }]);

        const block = fakeInteraction({ guild, customId: "setup:botmods:block:r-r1", values: ["ban", "kick"] });
        await setup.handleComponent(block);
        expect(getGuildConfig(guild.id).botMods[0].blocked).toEqual(["ban", "kick"]);
        expect(update(block).content).toBe("✅ Blocked 2 command(s).");
    });

    test("removing a mod", async () => {
        const guild = fakeGuild();
        updateGuildConfig(guild.id, { botMods: [{ type: "user", id: "u1", blocked: [] }] });
        await setup.handleComponent(fakeInteraction({ guild, customId: "setup:botmods:removemod:u-u1" }));
        expect(getGuildConfig(guild.id).botMods).toBeUndefined();
    });
});
