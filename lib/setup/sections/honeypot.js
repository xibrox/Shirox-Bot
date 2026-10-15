const {
    PermissionFlagsBits, ButtonStyle, ChannelType, ActionRowBuilder, StringSelectMenuBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require("discord.js");
const { getGuildConfig, updateGuildConfig } = require("../../guildConfig");
const { featureState } = require("../../features");
const { ACTION_LABELS, DEFAULT_WARNING_TITLE, honeypotError, savedWarning } = require("../../honeypot");
const {
    sectionView, channelPicker, buttonRow, button, channelText, pickedChannel, CHANNEL_GONE, savedChannel,
    STATE_TEXT, pauseButton, disableButton, featureStatus, togglePause,
} = require("../ui");

const section = {
    id: "honeypot",
    label: "Honeypot",
    emoji: "🍯",
    command: "honeypot",
    permission: PermissionFlagsBits.Administrator,

    status: config => featureStatus(config, "honeypot"),

    view(interaction, notice) {
        const config = getGuildConfig(interaction.guild.id);
        const state = featureState(config, "honeypot");
        const action = config.honeypotAction || "softban";
        const description = [
            "A trap channel: anyone who posts in it is removed. Staff with **Manage Messages** are ignored.",
            "💡 Put it near the top of the channel list; spam bots usually post in the first channels they see.",
            "",
            `**Status:** ${STATE_TEXT[state]}`,
            `**Channel:** ${channelText(config.honeypotChannelId)}`,
            `**Action:** ${ACTION_LABELS[action]}`,
            `**Warning:** ${config.honeypotWarningTitle || config.honeypotWarningText ? "custom text" : "default text"}`,
        ].join("\n");
        const actionMenu = new StringSelectMenuBuilder()
            .setCustomId("setup:honeypot:action")
            .addOptions(Object.entries(ACTION_LABELS).map(([value, label]) => ({ label, value, default: value === action })));
        return sectionView(section, description, [
            channelPicker("setup:honeypot:channel", savedChannel(interaction.guild, config.honeypotChannelId), {
                placeholder: "Pick the trap channel…", types: [ChannelType.GuildText],
            }),
            new ActionRowBuilder().addComponents(actionMenu),
            new ActionRowBuilder().addComponents(
                button("setup:honeypot:text", "✏️ Warning text"),
                button("setup:honeypot:preview", "👁️ Preview warning"),
                button("setup:honeypot:warning", "📤 Post warning", ButtonStyle.Primary).setDisabled(!config.honeypotChannelId),
            ),
            buttonRow(pauseButton("setup:honeypot:pause", state), disableButton("setup:honeypot:disable", state !== "off")),
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
                error ?? `🍯 Honeypot set to ${channel}. Use **📤 Post warning** so members know not to type there.`));
        }
        if (action === "action") {
            const chosen = interaction.values[0];
            const channel = config.honeypotChannelId && guild.channels.cache.get(config.honeypotChannelId);
            const error = channel ? honeypotError(guild, channel, chosen) : null;
            if (!error) updateGuildConfig(guild.id, { honeypotAction: chosen });
            return interaction.update(section.view(interaction,
                error ?? `✅ Action: **${ACTION_LABELS[chosen]}**. Re-post the warning if it mentions the action.`));
        }
        if (action === "text") {
            const title = new TextInputBuilder()
                .setCustomId("title").setLabel("Title (leave empty for the default)").setStyle(TextInputStyle.Short)
                .setMaxLength(256).setRequired(false).setPlaceholder(DEFAULT_WARNING_TITLE);
            const text = new TextInputBuilder()
                .setCustomId("text").setLabel("Text ({action} = what happens to posters)").setStyle(TextInputStyle.Paragraph)
                .setMaxLength(2000).setRequired(false);
            if (config.honeypotWarningTitle) title.setValue(config.honeypotWarningTitle);
            if (config.honeypotWarningText) text.setValue(config.honeypotWarningText);
            return interaction.showModal(new ModalBuilder()
                .setCustomId("setup:honeypot:text")
                .setTitle("Honeypot warning")
                .addComponents(new ActionRowBuilder().addComponents(title), new ActionRowBuilder().addComponents(text)));
        }
        if (action === "preview") {
            return interaction.reply({ embeds: [savedWarning(config, current)], flags: MessageFlags.Ephemeral });
        }
        if (action === "warning") {
            const channel = guild.channels.cache.get(config.honeypotChannelId);
            const sent = channel && await channel.send({ embeds: [savedWarning(config, current)] }).then(() => true, () => false);
            return interaction.update(section.view(interaction,
                sent ? `✅ Warning posted in ${channel}.` : "❌ I couldn't post in the honeypot channel."));
        }
        if (action === "pause") {
            const result = togglePause(guild.id, "honeypot");
            const notice = { paused: "⏸️ Honeypot paused. Your settings are kept.", resumed: "▶️ Honeypot resumed." }[result]
                ?? "❌ Pick a channel first.";
            return interaction.update(section.view(interaction, notice));
        }
        if (action === "disable") {
            updateGuildConfig(guild.id, {
                honeypotChannelId: null, honeypotAction: null, honeypotOff: null, honeypotWarningTitle: null, honeypotWarningText: null,
            });
            return interaction.update(section.view(interaction, "✅ Honeypot disabled."));
        }
    },

    async handleModal(interaction, action) {
        if (action !== "text") return;
        updateGuildConfig(interaction.guild.id, {
            honeypotWarningTitle: interaction.fields.getTextInputValue("title").trim() || null,
            honeypotWarningText: interaction.fields.getTextInputValue("text").trim() || null,
        });
        return interaction.update(section.view(interaction,
            "✅ Warning text saved. Use 📤 Post warning to update the notice in the channel."));
    },
};

module.exports = section;
