const { PermissionFlagsBits, ButtonStyle, ChannelType } = require("discord.js");
const { getGuildConfig, updateGuildConfig } = require("../../guildConfig");
const { missingChannelPermissions, SEND_EMBED_PERMISSIONS } = require("../../channelChecks");
const { sectionView, channelPicker, buttonRow, button, channelText, pickedChannel, CHANNEL_GONE, savedChannel } = require("../ui");

const section = {
    id: "logs",
    label: "Logs",
    emoji: "📜",
    permission: PermissionFlagsBits.ManageGuild,

    status: config => (config.logChannelId ? `on · <#${config.logChannelId}>` : "off"),

    view(interaction, notice) {
        const { logChannelId } = getGuildConfig(interaction.guild.id);
        const lines = [
            "Logs server activity (messages, members, moderation, voice) to a channel.",
            "",
            `**Channel:** ${channelText(logChannelId)}`,
        ];
        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
            lines.push("", "⚠️ Give me **View Audit Log** so logs can show who banned/kicked/timed out someone.");
        }
        return sectionView(section, lines.join("\n"), [
            channelPicker("setup:logs:channel", savedChannel(interaction.guild, logChannelId), { placeholder: "Pick the log channel…", types: [ChannelType.GuildText] }),
            buttonRow(button("setup:logs:disable", "Disable", ButtonStyle.Danger).setDisabled(!logChannelId)),
        ], notice);
    },

    async handleComponent(interaction, action) {
        const { guild } = interaction;
        if (action === "channel") {
            const channel = pickedChannel(interaction);
            const error = channel ? missingChannelPermissions(channel, guild.members.me, SEND_EMBED_PERMISSIONS) : CHANNEL_GONE;
            if (!error) updateGuildConfig(guild.id, { logChannelId: channel.id });
            return interaction.update(section.view(interaction, error ?? `✅ Logs will be sent to ${channel}.`));
        }
        if (action === "disable") {
            updateGuildConfig(guild.id, { logChannelId: null });
            return interaction.update(section.view(interaction, "✅ Logging disabled."));
        }
    },
};

module.exports = section;
