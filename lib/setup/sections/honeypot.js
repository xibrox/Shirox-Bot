const { PermissionFlagsBits, ButtonStyle, ChannelType, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const { getGuildConfig, updateGuildConfig } = require("../../guildConfig");
const { ACTION_LABELS, honeypotError, honeypotWarningEmbed } = require("../../honeypot");
const { sectionView, channelPicker, buttonRow, button, channelText, pickedChannel, CHANNEL_GONE, savedChannel } = require("../ui");

const section = {
    id: "honeypot",
    label: "Honeypot",
    emoji: "🍯",
    permission: PermissionFlagsBits.Administrator,

    status: config => (config.honeypotChannelId ? `on · <#${config.honeypotChannelId}>` : "off"),

    view(interaction, notice) {
        const config = getGuildConfig(interaction.guild.id);
        const action = config.honeypotAction || "softban";
        const description = [
            "A trap channel: anyone who posts in it is removed. Staff with **Manage Messages** are ignored.",
            "💡 Put it near the top of the channel list; spam bots usually post in the first channels they see.",
            "",
            `**Channel:** ${channelText(config.honeypotChannelId)}`,
            `**Action:** ${ACTION_LABELS[action]}`,
        ].join("\n");
        const actionMenu = new StringSelectMenuBuilder()
            .setCustomId("setup:honeypot:action")
            .addOptions(Object.entries(ACTION_LABELS).map(([value, label]) => ({ label, value, default: value === action })));
        return sectionView(section, description, [
            channelPicker("setup:honeypot:channel", savedChannel(interaction.guild, config.honeypotChannelId), { placeholder: "Pick the trap channel…", types: [ChannelType.GuildText] }),
            new ActionRowBuilder().addComponents(actionMenu),
            buttonRow(
                button("setup:honeypot:warning", "⚠️ Post warning").setDisabled(!config.honeypotChannelId),
                button("setup:honeypot:disable", "Disable", ButtonStyle.Danger).setDisabled(!config.honeypotChannelId),
            ),
        ], notice);
    },

    async handleComponent(interaction, action) {
        const { guild } = interaction;
        const config = getGuildConfig(guild.id);
        const current = config.honeypotAction || "softban";

        if (action === "channel") {
            const channel = pickedChannel(interaction);
            const error = channel ? honeypotError(guild, channel, current) : CHANNEL_GONE;
            if (!error) updateGuildConfig(guild.id, { honeypotChannelId: channel.id, honeypotAction: current });
            return interaction.update(section.view(interaction,
                error ?? `🍯 Honeypot active in ${channel}. Use **Post warning** so members know not to type there.`));
        }
        if (action === "action") {
            const chosen = interaction.values[0];
            const channel = config.honeypotChannelId && guild.channels.cache.get(config.honeypotChannelId);
            const error = channel ? honeypotError(guild, channel, chosen) : null;
            if (!error) updateGuildConfig(guild.id, { honeypotAction: chosen });
            return interaction.update(section.view(interaction, error ?? `✅ Action: **${ACTION_LABELS[chosen]}**`));
        }
        if (action === "warning") {
            const channel = guild.channels.cache.get(config.honeypotChannelId);
            const sent = channel && await channel.send({ embeds: [honeypotWarningEmbed(current)] }).then(() => true, () => false);
            return interaction.update(section.view(interaction,
                sent ? `✅ Warning posted in ${channel}.` : "❌ I couldn't post in the honeypot channel."));
        }
        if (action === "disable") {
            updateGuildConfig(guild.id, { honeypotChannelId: null, honeypotAction: null });
            return interaction.update(section.view(interaction, "✅ Honeypot disabled."));
        }
    },
};

module.exports = section;
