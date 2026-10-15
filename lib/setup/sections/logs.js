const { PermissionFlagsBits, ChannelType, ActionRowBuilder } = require("discord.js");
const { getGuildConfig, updateGuildConfig } = require("../../guildConfig");
const { featureState } = require("../../features");
const { LOG_TYPES } = require("../../logger");
const { missingChannelPermissions, SEND_EMBED_PERMISSIONS } = require("../../channelChecks");
const {
    sectionView, channelPicker, buttonRow, toggleButton, channelText, pickedChannel, CHANNEL_GONE, savedChannel,
    STATE_TEXT, pauseButton, disableButton, featureStatus, togglePause,
} = require("../ui");

const section = {
    id: "logs",
    label: "Logs",
    emoji: "📜",
    permission: PermissionFlagsBits.ManageGuild,

    status: config => featureStatus(config, "logs"),

    view(interaction, notice) {
        const config = getGuildConfig(interaction.guild.id);
        const state = featureState(config, "logs");
        const typesOff = config.logTypesOff ?? [];
        const lines = [
            "Logs server activity to a channel. Switch off the kinds you don't want.",
            "",
            `**Status:** ${STATE_TEXT[state]}`,
            `**Channel:** ${channelText(config.logChannelId)}`,
            `**Logged:** ${LOG_TYPES.map(t => `${t.emoji} ${t.label} ${typesOff.includes(t.id) ? "❌" : "✅"}`).join(" · ")}`,
        ];
        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
            lines.push("", "⚠️ Give me **View Audit Log** so logs can show who banned/kicked/timed out someone.");
        }
        return sectionView(section, lines.join("\n"), [
            channelPicker("setup:logs:channel", savedChannel(interaction.guild, config.logChannelId), {
                placeholder: "Pick the log channel…", types: [ChannelType.GuildText],
            }),
            new ActionRowBuilder().addComponents(LOG_TYPES.map(t =>
                toggleButton(`setup:logs:type:${t.id}`, `${t.emoji} ${t.label}`, !typesOff.includes(t.id)))),
            buttonRow(pauseButton("setup:logs:pause", state), disableButton("setup:logs:disable", state !== "off")),
        ], notice);
    },

    async handleComponent(interaction, action, arg) {
        const { guild } = interaction;
        const config = getGuildConfig(guild.id);

        if (action === "channel") {
            const channel = pickedChannel(interaction);
            const error = channel ? missingChannelPermissions(channel, guild.members.me, SEND_EMBED_PERMISSIONS) : CHANNEL_GONE;
            if (!error) updateGuildConfig(guild.id, { logChannelId: channel.id });
            const pausedNote = config.logsOff ? " Logging is paused; press ▶️ Resume to turn it back on." : "";
            return interaction.update(section.view(interaction, error ?? `✅ Logs will be sent to ${channel}.${pausedNote}`));
        }
        if (action === "type") {
            const type = LOG_TYPES.find(t => t.id === arg);
            if (!type) return;
            const typesOff = config.logTypesOff ?? [];
            const turningOff = !typesOff.includes(type.id);
            const next = turningOff ? [...typesOff, type.id] : typesOff.filter(id => id !== type.id);
            updateGuildConfig(guild.id, { logTypesOff: next.length ? next : null });
            return interaction.update(section.view(interaction, `${type.emoji} ${type.label} logs: ${turningOff ? "❌ off" : "✅ on"}`));
        }
        if (action === "pause") {
            const result = togglePause(guild.id, "logs");
            const notice = { paused: "⏸️ Logging paused. Your settings are kept.", resumed: "▶️ Logging resumed." }[result]
                ?? "❌ Pick a channel first.";
            return interaction.update(section.view(interaction, notice));
        }
        if (action === "disable") {
            updateGuildConfig(guild.id, { logChannelId: null, logsOff: null, logTypesOff: null });
            return interaction.update(section.view(interaction, "✅ Logging disabled."));
        }
    },
};

module.exports = section;
