const { describe, test, expect, mock } = require("bun:test");
const { PermissionsBitField } = require("discord.js");
const setup = require("../commands/setup");
const automodEvent = require("../events/automod");
const { getGuildConfig, updateGuildConfig } = require("../lib/guildConfig");
const { fakeGuild, fakeInteraction } = require("./fakes");

const update = interaction => interaction.update.mock.calls.at(-1)[0];

function inviteMessage(guild, inviteGuildId) {
    return {
        id: "m1",
        content: "join discord.gg/abc123",
        inGuild: () => true,
        author: { bot: false, tag: "u#1", id: "u1", toString: () => "<@u1>" },
        member: { permissions: new PermissionsBitField(0n), moderatable: false },
        guild,
        channelId: "general",
        channel: { send: mock(async () => null), toString: () => "<#general>" },
        client: { fetchInvite: mock(async () => ({ guild: { id: inviteGuildId, name: "Friends" } })) },
        delete: mock(async () => {}),
    };
}

describe("automod invites with an allowlist", () => {
    test("invites to allowed servers stay", async () => {
        const guild = fakeGuild();
        updateGuildConfig(guild.id, { automodInvites: true, automodInviteAllow: [{ id: "222222222222222222", name: "Friends" }] });
        const message = inviteMessage(guild, "222222222222222222");
        await automodEvent.execute(message);
        expect(message.delete).not.toHaveBeenCalled();
    });

    test("invites to other servers are still removed", async () => {
        const guild = fakeGuild();
        updateGuildConfig(guild.id, { automodInvites: true, automodInviteAllow: [{ id: "222222222222222222", name: "Friends" }] });
        const message = inviteMessage(guild, "333333333333333333");
        await automodEvent.execute(message);
        expect(message.delete).toHaveBeenCalled();
    });
});

describe("automod section allowlist", () => {
    test("an invite link adds its server", async () => {
        const interaction = fakeInteraction({ customId: "setup:automod:allow", fields: { target: "https://discord.gg/abc123" } });
        interaction.client.fetchInvite = mock(async () => ({ guild: { id: "222222222222222222", name: "Friends" } }));
        await setup.handleModal(interaction);
        expect(getGuildConfig(interaction.guild.id).automodInviteAllow).toEqual([{ id: "222222222222222222", name: "Friends" }]);
        expect(update(interaction).content).toBe("✅ Invites to **Friends** are allowed.");
    });

    test("a server ID is accepted directly", async () => {
        const interaction = fakeInteraction({ customId: "setup:automod:allow", fields: { target: "444444444444444444" } });
        interaction.client.guilds = { cache: new Map() };
        await setup.handleModal(interaction);
        expect(getGuildConfig(interaction.guild.id).automodInviteAllow).toEqual([{ id: "444444444444444444", name: "Server 444444444444444444" }]);
    });

    test("bad input and duplicates are refused", async () => {
        const bad = fakeInteraction({ customId: "setup:automod:allow", fields: { target: "hello there" } });
        bad.client.fetchInvite = mock(async () => { throw new Error("Unknown Invite"); });
        await setup.handleModal(bad);
        expect(update(bad).content).toBe("❌ That isn't a valid invite link or server ID.");

        const guild = fakeGuild();
        updateGuildConfig(guild.id, { automodInviteAllow: [{ id: "444444444444444444", name: "X" }] });
        const dup = fakeInteraction({ guild, customId: "setup:automod:allow", fields: { target: "444444444444444444" } });
        dup.client.guilds = { cache: new Map() };
        await setup.handleModal(dup);
        expect(update(dup).content).toBe("ℹ️ **X** is already allowed.");
    });

    test("picking a server in the menu removes it", async () => {
        const guild = fakeGuild();
        updateGuildConfig(guild.id, { automodInviteAllow: [{ id: "444444444444444444", name: "X" }] });
        const interaction = fakeInteraction({ guild, customId: "setup:automod:unallow", values: ["444444444444444444"] });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(guild.id).automodInviteAllow).toBeUndefined();
        expect(update(interaction).content).toBe("✅ Invites to **X** are no longer allowed.");
    });
});
