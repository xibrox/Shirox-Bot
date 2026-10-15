const { describe, test, expect } = require("bun:test");
const { PermissionFlagsBits: P, MessageFlags } = require("discord.js");
const setup = require("../commands/setup");
const { getGuildConfig, updateGuildConfig } = require("../lib/guildConfig");
const { fakeGuild, fakeChannel, fakeInteraction } = require("./fakes");

const OUT_OF_DATE = "⚠️ This dashboard is out of date. Run /setup again.";
const reply = interaction => interaction.reply.mock.calls[0][0];
const update = interaction => interaction.update.mock.calls[0][0];

describe("/setup", () => {
    test("opens the home view privately", async () => {
        const interaction = fakeInteraction();
        await setup.execute(interaction);
        expect(reply(interaction).flags).toBe(MessageFlags.Ephemeral);
        expect(reply(interaction).embeds[0].toJSON().title).toBe("⚙️ Test Server setup");
        expect(reply(interaction).embeds[0].toJSON().footer.text).toBe("Only you can see this. Changes save immediately.");
    });

    test("refuses members who can't open any section", async () => {
        const interaction = fakeInteraction({ permissions: P.SendMessages });
        await setup.execute(interaction);
        expect(reply(interaction).content).toBe("❌ You don't have permission to change any settings.");
    });
});

describe("routing", () => {
    test("the home menu opens a section", async () => {
        const interaction = fakeInteraction({ customId: "setup:home:open", values: ["logs"] });
        await setup.handleComponent(interaction);
        expect(update(interaction).embeds[0].toJSON().title).toBe("📜 Logs");
    });

    test("◀ Home goes back to the home view", async () => {
        const interaction = fakeInteraction({ customId: "setup:home:show" });
        await setup.handleComponent(interaction);
        expect(update(interaction).embeds[0].toJSON().title).toBe("⚙️ Test Server setup");
    });

    test("clicks re-check the section's permission", async () => {
        const interaction = fakeInteraction({ permissions: P.SendMessages, customId: "setup:logs:disable" });
        await setup.handleComponent(interaction);
        expect(reply(interaction).content).toBe("❌ You need **Manage Server** for this.");
    });

    test("unknown sections and actions say the dashboard is out of date", async () => {
        for (const customId of ["setup:nope:x", "setup:logs:nope", "setup:home:nope"]) {
            const interaction = fakeInteraction({ customId });
            await setup.handleComponent(interaction);
            expect(reply(interaction).content).toBe(OUT_OF_DATE);
        }
    });
});

describe("logs section", () => {
    test("picking a channel saves it", async () => {
        const channel = fakeChannel();
        const guild = fakeGuild({ channels: [channel] });
        const interaction = fakeInteraction({ guild, customId: "setup:logs:channel", values: [channel.id] });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(guild.id).logChannelId).toBe(channel.id);
        expect(update(interaction).content).toBe(`✅ Logs will be sent to <#${channel.id}>.`);
    });

    test("a channel the bot can't post in is refused", async () => {
        const channel = fakeChannel(undefined, P.ViewChannel);
        const guild = fakeGuild({ channels: [channel] });
        const interaction = fakeInteraction({ guild, customId: "setup:logs:channel", values: [channel.id] });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(guild.id).logChannelId).toBeUndefined();
        expect(update(interaction).content).toStartWith("❌ I need View Channel");
    });

    test("a channel that no longer exists is refused", async () => {
        const interaction = fakeInteraction({ customId: "setup:logs:channel", values: ["deleted"] });
        await setup.handleComponent(interaction);
        expect(update(interaction).content).toBe("❌ I can't see that channel.");
    });

    test("disable clears the channel", async () => {
        const interaction = fakeInteraction({ customId: "setup:logs:disable" });
        updateGuildConfig(interaction.guild.id, { logChannelId: "c1" });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(interaction.guild.id).logChannelId).toBeUndefined();
        expect(update(interaction).content).toBe("✅ Logging disabled.");
    });
});
