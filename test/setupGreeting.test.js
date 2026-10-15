const { test, expect } = require("bun:test");
const { MessageFlags } = require("discord.js");
const setup = require("../commands/setup");
const { getGuildConfig, updateGuildConfig } = require("../lib/guildConfig");
const { buildGreetingEmbed } = require("../lib/greetings");
const { fakeGuild, fakeChannel, fakeInteraction } = require("./fakes");

const update = interaction => interaction.update.mock.calls[0][0];
const fakeMember = guild => ({
    guild,
    user: { username: "newbie", createdTimestamp: Date.now(), displayAvatarURL: () => "https://cdn.example/a.png" },
    toString: () => "<@u1>",
});

test("picking a channel turns welcome on and keeps the text", async () => {
    const channel = fakeChannel();
    const guild = fakeGuild({ channels: [channel] });
    updateGuildConfig(guild.id, { welcomeMessage: "Hi {user}" });
    const interaction = fakeInteraction({ guild, customId: "setup:welcome:channel", values: [channel.id] });
    await setup.handleComponent(interaction);
    expect(getGuildConfig(guild.id)).toMatchObject({ welcomeChannelId: channel.id, welcomeMessage: "Hi {user}" });
    expect(update(interaction).content).toBe(`✅ Welcome messages will be sent in <#${channel.id}>.`);
});

test("Edit text opens a form prefilled with title and message", async () => {
    const interaction = fakeInteraction({ customId: "setup:welcome:text" });
    updateGuildConfig(interaction.guild.id, { welcomeTitle: "Hey {user}", welcomeMessage: "Hi {user}" });
    await setup.handleComponent(interaction);
    const modal = interaction.showModal.mock.calls[0][0].toJSON();
    expect(modal.custom_id).toBe("setup:welcome:text");
    expect(modal.components.map(row => row.components[0].value)).toEqual(["Hey {user}", "Hi {user}"]);
});

test("saving text without a channel says to pick one", async () => {
    const interaction = fakeInteraction({ customId: "setup:welcome:text", fields: { title: "Hey", message: "Hello {user}" } });
    await setup.handleModal(interaction);
    expect(getGuildConfig(interaction.guild.id)).toMatchObject({ welcomeTitle: "Hey", welcomeMessage: "Hello {user}" });
    expect(update(interaction).content).toBe("✅ Text saved. Pick a channel to turn it on.");
});

test("empty fields go back to the defaults", async () => {
    const interaction = fakeInteraction({ customId: "setup:welcome:text", fields: { title: " ", message: "   " } });
    updateGuildConfig(interaction.guild.id, { welcomeChannelId: "c1", welcomeTitle: "Old", welcomeMessage: "Old" });
    await setup.handleModal(interaction);
    expect(getGuildConfig(interaction.guild.id).welcomeTitle).toBeUndefined();
    expect(getGuildConfig(interaction.guild.id).welcomeMessage).toBeUndefined();
    expect(update(interaction).content).toBe("✅ Text saved.");
});

test("Pause keeps the settings and Resume turns it back on", async () => {
    const guild = fakeGuild();
    updateGuildConfig(guild.id, { welcomeChannelId: "c1", welcomeMessage: "Hi" });
    const pause = fakeInteraction({ guild, customId: "setup:welcome:pause" });
    await setup.handleComponent(pause);
    expect(getGuildConfig(guild.id)).toMatchObject({ welcomeChannelId: "c1", welcomeMessage: "Hi", welcomeOff: true });
    expect(update(pause).content).toBe("⏸️ Welcome messages paused. Your settings are kept.");

    const resume = fakeInteraction({ guild, customId: "setup:welcome:pause" });
    await setup.handleComponent(resume);
    expect(getGuildConfig(guild.id).welcomeOff).toBeUndefined();
    expect(update(resume).content).toBe("▶️ Welcome messages resumed.");
});

test("Pause without a channel asks for one", async () => {
    const interaction = fakeInteraction({ customId: "setup:welcome:pause" });
    await setup.handleComponent(interaction);
    expect(getGuildConfig(interaction.guild.id).welcomeOff).toBeUndefined();
    expect(update(interaction).content).toBe("❌ Pick a channel first.");
});

test("Disable clears channel, text and pause", async () => {
    const interaction = fakeInteraction({ customId: "setup:welcome:disable" });
    updateGuildConfig(interaction.guild.id, { welcomeChannelId: "c1", welcomeMessage: "Hi", welcomeTitle: "T", welcomeOff: true });
    await setup.handleComponent(interaction);
    expect(getGuildConfig(interaction.guild.id)).toEqual({});
    expect(update(interaction).content).toBe("✅ Welcome messages disabled.");
});

test("Preview shows the saved title privately", async () => {
    const guild = fakeGuild();
    updateGuildConfig(guild.id, { welcomeTitle: "Hey {user} in {server}" });
    const interaction = fakeInteraction({ guild, customId: "setup:welcome:preview" });
    interaction.member = fakeMember(guild);
    await setup.handleComponent(interaction);
    const reply = interaction.reply.mock.calls[0][0];
    expect(reply.flags).toBe(MessageFlags.Ephemeral);
    expect(reply.embeds[0].toJSON().title).toBe("Hey newbie in Test Server");
});

test("titles fall back to the defaults", () => {
    const guild = fakeGuild();
    expect(buildGreetingEmbed(fakeMember(guild), "Hi", true).toJSON().title).toBe("👋 Welcome to Test Server!");
    expect(buildGreetingEmbed(fakeMember(guild), "Bye", false).toJSON().title).toBe("👋 Goodbye!");
});

test("goodbye uses its own settings", async () => {
    const channel = fakeChannel();
    const guild = fakeGuild({ channels: [channel] });
    const interaction = fakeInteraction({ guild, customId: "setup:goodbye:channel", values: [channel.id] });
    await setup.handleComponent(interaction);
    expect(getGuildConfig(guild.id).goodbyeChannelId).toBe(channel.id);
    expect(getGuildConfig(guild.id).welcomeChannelId).toBeUndefined();
});
