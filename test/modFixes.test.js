const { describe, test, expect, mock } = require("bun:test");
const { PermissionsBitField, PermissionFlagsBits: P, ChannelType } = require("discord.js");
const mod = require("../commands/mod");
const actions = require("../lib/modActions");
const { recordAction } = require("../lib/modHistory");
const { getWarnings } = require("../lib/warnings");
const { updateGuildConfig } = require("../lib/guildConfig");
const { fakeGuild, fakeChannel, fakeTextChannel, fakeMember, fakeUser, fakeInteraction } = require("./fakes");
const { rowsOf } = require("./limits");

const update = interaction => interaction.update.mock.calls.at(-1)[0];

describe("channel tools check the target channel", () => {
    // The moderator has Manage Messages/Channels in the panel's channel but not in #other
    function setup() {
        const other = fakeTextChannel("other");
        const guild = fakeGuild({ channels: [other] });
        const make = (customId, fields) => {
            // Not an admin: admins have every permission in every channel anyway
            const interaction = fakeInteraction({ guild, customId, fields, permissions: P.ManageMessages | P.ManageChannels | P.ModerateMembers });
            other.permissionsFor = who => new PermissionsBitField(who === interaction.member ? 0n : P.Administrator);
            return interaction;
        };
        return { other, make };
    }

    test("purge in a channel the moderator can't manage is refused", async () => {
        const { other, make } = setup();
        const submit = make("mod:channel:purge:other", { amount: "10", user: "" });
        await mod.handleModal(submit);
        expect(other.bulkDelete).not.toHaveBeenCalled();
        expect(submit.reply.mock.calls[0][0].content).toBe("❌ You need **Manage Messages** for this.");

        const open = make("mod:channel:lock:other");
        await mod.handleComponent(open);
        expect(open.showModal).not.toHaveBeenCalled();
        expect(open.reply.mock.calls[0][0].content).toBe("❌ You need **Manage Channels** for this.");
    });

    test("buttons are hidden for a channel the moderator can't manage", async () => {
        const { make } = setup();
        const interaction = make("mod:channel:pick");
        interaction.values = ["other"];
        await mod.handleComponent(interaction);
        expect(rowsOf(update(interaction))[1].components.map(c => c.custom_id)).toEqual(["mod:home:show"]);
    });

    test("a panel opened in a thread works on the thread's parent channel", async () => {
        const parent = fakeTextChannel("parent");
        const guild = fakeGuild({ channels: [parent] });
        const interaction = fakeInteraction({ guild, customId: "mod:channel:show" });
        interaction.channel = { id: "thread1", type: ChannelType.PublicThread, parent };
        interaction.channelId = "thread1";
        await mod.handleComponent(interaction);
        expect(update(interaction).embeds[0].toJSON().description).toContain("**Channel:** <#parent>");
    });
});

test("the history menu labels each user with their newest action", async () => {
    const guild = fakeGuild();
    recordAction(guild.id, { type: "warn", targetId: "u1", moderatorId: "m", reason: "old" });
    recordAction(guild.id, { type: "ban", targetId: "u1", moderatorId: "m", reason: "new" });
    const interaction = fakeInteraction({ guild, customId: "mod:history:show" });
    await mod.handleComponent(interaction);
    expect(rowsOf(update(interaction))[0].components[0].options[0].label).toStartWith("ban");
});

test("history entries without an emoji don't break the menu", async () => {
    const guild = fakeGuild();
    recordAction(guild.id, { type: "mystery", targetId: "u1", moderatorId: "m", reason: null });
    const interaction = fakeInteraction({ guild, customId: "mod:history:show" });
    await mod.handleComponent(interaction);
    expect(rowsOf(update(interaction))[0].components[0].options[0].emoji).toBeUndefined();
});

test("the user view asks Discord for the ban, not a stale cache", async () => {
    const user = fakeUser("123456789012345678");
    const guild = fakeGuild({ bans: [user.id] });
    const interaction = fakeInteraction({ guild, customId: "mod:user:show:" + user.id });
    interaction.client.users = { fetch: async () => user };
    await mod.handleComponent(interaction);
    expect(guild.bans.fetch).toHaveBeenCalledWith({ user: user.id, force: true });
});

test("the bans list says when it hit Discord's 1000 limit", async () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `2${String(i).padStart(17, "0")}`);
    const interaction = fakeInteraction({ guild: fakeGuild({ bans: ids }), customId: "mod:bans:show" });
    await mod.handleComponent(interaction);
    expect(update(interaction).embeds[0].toJSON().title).toBe("🚫 Bans (1000+)");
});

test("a blank warn reason is refused", async () => {
    const member = fakeMember();
    const guild = fakeGuild({ members: [member] });
    const interaction = fakeInteraction({ guild, customId: `mod:user:warn:${member.id}`, fields: { reason: "   " } });
    interaction.client.users = { fetch: async () => member.user };
    await mod.handleModal(interaction);
    expect(getWarnings(guild.id, member.id)).toEqual([]);
    expect(update(interaction).content).toBe("❌ A reason is required.");
});

test("a public line that can't be posted is mentioned", async () => {
    const member = fakeMember();
    const guild = fakeGuild({ members: [member] });
    const interaction = fakeInteraction({ guild, customId: `mod:user:kick:${member.id}`, fields: { reason: "x" } });
    interaction.client.users = { fetch: async () => member.user };
    interaction.channel.send = mock(async () => { throw new Error("Missing Access"); });
    await mod.handleModal(interaction);
    expect(update(interaction).content).toEndWith("\n⚠️ I couldn't post that in this channel.");
});

test("viewing a member needs Timeout Members", async () => {
    const interaction = fakeInteraction({ permissions: P.BanMembers, customId: "mod:user:show:123456789012345678" });
    await mod.handleComponent(interaction);
    expect(interaction.reply.mock.calls[0][0].content).toBe("❌ You need **Timeout Members** for this.");
});

test("/warn replies without waiting for the log channel", async () => {
    const logs = fakeChannel("logs");
    logs.send = mock(() => new Promise(() => {}));
    const interaction = fakeInteraction({ guild: fakeGuild({ channels: [logs] }) });
    updateGuildConfig(interaction.guild.id, { logChannelId: "logs" });
    const result = await Promise.race([
        actions.warnUser(interaction, fakeUser(), "spam"),
        new Promise(resolve => setTimeout(() => resolve("stuck"), 50)),
    ]);
    expect(result).not.toBe("stuck");
});
