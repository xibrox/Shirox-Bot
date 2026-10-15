const { describe, test, expect } = require("bun:test");
const { PermissionFlagsBits: P } = require("discord.js");
const setup = require("../commands/setup");
const { getGuildConfig, updateGuildConfig } = require("../lib/guildConfig");
const { fakeGuild, fakeChannel, fakeInteraction } = require("./fakes");

const update = interaction => interaction.update.mock.calls[0][0];

describe("honeypot section", () => {
    test("is hidden from members without Administrator", () => {
        const payload = setup.homeView(fakeInteraction({ permissions: P.ManageGuild }));
        const ids = payload.components[0].toJSON().components[0].options.map(o => o.value);
        expect(ids).toContain("logs");
        expect(ids).not.toContain("honeypot");
    });

    test("picking a channel turns it on with soft ban", async () => {
        const channel = fakeChannel();
        const guild = fakeGuild({ channels: [channel] });
        const interaction = fakeInteraction({ guild, customId: "setup:honeypot:channel", values: [channel.id] });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(guild.id)).toMatchObject({ honeypotChannelId: channel.id, honeypotAction: "softban" });
    });

    test("picking a channel without Ban Members is refused", async () => {
        const channel = fakeChannel();
        const guild = fakeGuild({ botPermissions: P.KickMembers, channels: [channel] });
        const interaction = fakeInteraction({ guild, customId: "setup:honeypot:channel", values: [channel.id] });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(guild.id).honeypotChannelId).toBeUndefined();
        expect(update(interaction).content).toBe("❌ I need the **Ban Members** permission for this.");
    });

    test("changing the action is saved", async () => {
        const interaction = fakeInteraction({ customId: "setup:honeypot:action", values: ["kick"] });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(interaction.guild.id).honeypotAction).toBe("kick");
    });

    test("Post warning sends the warning to the honeypot channel", async () => {
        const channel = fakeChannel();
        const guild = fakeGuild({ channels: [channel] });
        updateGuildConfig(guild.id, { honeypotChannelId: channel.id, honeypotAction: "ban" });
        const interaction = fakeInteraction({ guild, customId: "setup:honeypot:warning" });
        await setup.handleComponent(interaction);
        expect(channel.send.mock.calls[0][0].embeds[0].toJSON().description).toContain("automatically banned");
        expect(update(interaction).content).toBe(`✅ Warning posted in <#${channel.id}>.`);
    });
});

describe("automod section", () => {
    test("toggles flip a rule on and off", async () => {
        const guild = fakeGuild();
        await setup.handleComponent(fakeInteraction({ guild, customId: "setup:automod:toggle:invites" }));
        expect(getGuildConfig(guild.id).automodInvites).toBe(true);
        await setup.handleComponent(fakeInteraction({ guild, customId: "setup:automod:toggle:invites" }));
        expect(getGuildConfig(guild.id).automodInvites).toBeUndefined();
    });

    test("the limits form saves both numbers", async () => {
        const interaction = fakeInteraction({ customId: "setup:automod:limits", fields: { mentions: "5", age: "7" } });
        await setup.handleModal(interaction);
        expect(getGuildConfig(interaction.guild.id)).toMatchObject({ automodMentionLimit: 5, automodMinAccountAgeDays: 7 });
        expect(update(interaction).content).toBe("✅ Limits saved.");
    });

    test("invalid limits are refused", async () => {
        const interaction = fakeInteraction({ customId: "setup:automod:limits", fields: { mentions: "abc", age: "400" } });
        await setup.handleModal(interaction);
        expect(getGuildConfig(interaction.guild.id).automodMentionLimit).toBeUndefined();
        expect(update(interaction).content).toBe("❌ Use whole numbers: mentions 0–50, account age 0–365.");
    });

    test("the account age rule needs Kick Members", async () => {
        const guild = fakeGuild({ botPermissions: P.BanMembers });
        const interaction = fakeInteraction({ guild, customId: "setup:automod:limits", fields: { mentions: "0", age: "3" } });
        await setup.handleModal(interaction);
        expect(getGuildConfig(guild.id).automodMinAccountAgeDays).toBeUndefined();
        expect(update(interaction).content).toBe("❌ I need the **Kick Members** permission for the account age rule.");
    });
});
