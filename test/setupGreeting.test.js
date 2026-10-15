const { test, expect } = require("bun:test");
const setup = require("../commands/setup");
const { getGuildConfig, updateGuildConfig } = require("../lib/guildConfig");
const { fakeGuild, fakeChannel, fakeInteraction } = require("./fakes");

const update = interaction => interaction.update.mock.calls[0][0];

test("picking a channel turns welcome on and keeps the message", async () => {
    const channel = fakeChannel();
    const guild = fakeGuild({ channels: [channel] });
    updateGuildConfig(guild.id, { welcomeMessage: "Hi {user}" });
    const interaction = fakeInteraction({ guild, customId: "setup:welcome:channel", values: [channel.id] });
    await setup.handleComponent(interaction);
    expect(getGuildConfig(guild.id)).toMatchObject({ welcomeChannelId: channel.id, welcomeMessage: "Hi {user}" });
    expect(update(interaction).content).toBe(`✅ Welcome messages will be sent in <#${channel.id}>.`);
});

test("Edit message opens a prefilled form", async () => {
    const interaction = fakeInteraction({ customId: "setup:welcome:message" });
    updateGuildConfig(interaction.guild.id, { welcomeMessage: "Hi {user}" });
    await setup.handleComponent(interaction);
    const modal = interaction.showModal.mock.calls[0][0].toJSON();
    expect(modal.custom_id).toBe("setup:welcome:message");
    expect(modal.components[0].components[0].value).toBe("Hi {user}");
});

test("saving a message without a channel says to pick one", async () => {
    const interaction = fakeInteraction({ customId: "setup:welcome:message", fields: { message: "Hello {user}" } });
    await setup.handleModal(interaction);
    expect(getGuildConfig(interaction.guild.id).welcomeMessage).toBe("Hello {user}");
    expect(update(interaction).content).toBe("✅ Message saved. Pick a channel to turn it on.");
});

test("an empty message goes back to the default", async () => {
    const interaction = fakeInteraction({ customId: "setup:welcome:message", fields: { message: "   " } });
    updateGuildConfig(interaction.guild.id, { welcomeChannelId: "c1", welcomeMessage: "Old" });
    await setup.handleModal(interaction);
    expect(getGuildConfig(interaction.guild.id).welcomeMessage).toBeUndefined();
    expect(update(interaction).content).toBe("✅ Message saved.");
});

test("disable clears the channel and message", async () => {
    const interaction = fakeInteraction({ customId: "setup:welcome:disable" });
    updateGuildConfig(interaction.guild.id, { welcomeChannelId: "c1", welcomeMessage: "Hi" });
    await setup.handleComponent(interaction);
    expect(getGuildConfig(interaction.guild.id).welcomeChannelId).toBeUndefined();
    expect(getGuildConfig(interaction.guild.id).welcomeMessage).toBeUndefined();
});

test("goodbye uses its own settings", async () => {
    const channel = fakeChannel();
    const guild = fakeGuild({ channels: [channel] });
    const interaction = fakeInteraction({ guild, customId: "setup:goodbye:channel", values: [channel.id] });
    await setup.handleComponent(interaction);
    expect(getGuildConfig(guild.id).goodbyeChannelId).toBe(channel.id);
    expect(getGuildConfig(guild.id).welcomeChannelId).toBeUndefined();
});
