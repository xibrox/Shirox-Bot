const { test, expect } = require("bun:test");
const setup = require("../commands/setup");
const { getGuildConfig, updateGuildConfig } = require("../lib/guildConfig");
const { fakeInteraction } = require("./fakes");

const update = interaction => interaction.update.mock.calls[0][0];
const rows = payload => payload.components.map(row => row.toJSON().components);

test("the view has a toggle for each log type", () => {
    const logs = require("../lib/setup/sections/logs");
    const ids = rows(logs.view(fakeInteraction()))[1].map(c => c.custom_id);
    expect(ids).toEqual(["messages", "members", "moderation", "server", "voice"].map(t => `setup:logs:type:${t}`));
});

test("a type toggle switches that type off and on", async () => {
    const off = fakeInteraction({ customId: "setup:logs:type:voice" });
    await setup.handleComponent(off);
    expect(getGuildConfig(off.guild.id).logTypesOff).toEqual(["voice"]);
    expect(update(off).content).toBe("🔊 Voice logs: ❌ off");

    const on = fakeInteraction({ guild: off.guild, customId: "setup:logs:type:voice" });
    await setup.handleComponent(on);
    expect(getGuildConfig(off.guild.id).logTypesOff).toBeUndefined();
});

test("an unknown type is out of date", async () => {
    const interaction = fakeInteraction({ customId: "setup:logs:type:nope" });
    await setup.handleComponent(interaction);
    expect(interaction.reply.mock.calls[0][0].content).toBe("⚠️ This dashboard is out of date. Run /setup again.");
});

test("Pause keeps the channel", async () => {
    const interaction = fakeInteraction({ customId: "setup:logs:pause" });
    updateGuildConfig(interaction.guild.id, { logChannelId: "c1" });
    await setup.handleComponent(interaction);
    expect(getGuildConfig(interaction.guild.id)).toMatchObject({ logChannelId: "c1", logsOff: true });
    expect(update(interaction).content).toBe("⏸️ Logging paused. Your settings are kept.");
});

test("Disable clears channel, pause and types", async () => {
    const interaction = fakeInteraction({ customId: "setup:logs:disable" });
    updateGuildConfig(interaction.guild.id, { logChannelId: "c1", logsOff: true, logTypesOff: ["voice"] });
    await setup.handleComponent(interaction);
    expect(getGuildConfig(interaction.guild.id)).toEqual({});
});
