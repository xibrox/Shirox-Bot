const {
    PermissionFlagsBits, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require("discord.js");
const { getGuildConfig, updateGuildConfig } = require("../../guildConfig");
const { FEATURES, featureState } = require("../../features");
const { missingChannelPermissions, SEND_EMBED_PERMISSIONS } = require("../../channelChecks");
const { PLACEHOLDERS, buildGreetingEmbed } = require("../../greetings");
const {
    sectionView, channelPicker, buttonRow, button, channelText, pickedChannel, CHANNEL_GONE, savedChannel,
    STATE_TEXT, pauseButton, disableButton, featureStatus, togglePause,
} = require("../ui");

// Welcome and goodbye work the same way and only differ in their settings keys and wording
function greetingSection({ id, label, emoji, joining, defaultMessage, defaultTitle }) {
    const { channelKey, offKey } = FEATURES[id];
    const messageKey = `${id}Message`;
    const titleKey = `${id}Title`;

    const section = {
        id,
        label,
        emoji,
        permission: PermissionFlagsBits.ManageGuild,

        status: config => featureStatus(config, id),

        view(interaction, notice) {
            const config = getGuildConfig(interaction.guild.id);
            const state = featureState(config, id);
            const description = [
                `**Status:** ${STATE_TEXT[state]}`,
                `**Channel:** ${channelText(config[channelKey])}`,
                `**Title:** ${config[titleKey] || `*default:* ${defaultTitle}`}`,
                `**Message:** ${config[messageKey] || `*default:* ${defaultMessage}`}`,
                "",
                `Placeholders: ${PLACEHOLDERS}`,
            ].join("\n");
            return sectionView(section, description, [
                channelPicker(`setup:${id}:channel`, savedChannel(interaction.guild, config[channelKey]), { placeholder: `Pick the ${id} channel…` }),
                new ActionRowBuilder().addComponents(
                    button(`setup:${id}:text`, "✏️ Edit text"),
                    button(`setup:${id}:preview`, "👁️ Preview"),
                    pauseButton(`setup:${id}:pause`, state),
                    disableButton(`setup:${id}:disable`, state !== "off"),
                ),
                buttonRow(),
            ], notice);
        },

        async handleComponent(interaction, action) {
            const { guild } = interaction;
            const config = getGuildConfig(guild.id);

            if (action === "channel") {
                const channel = pickedChannel(interaction);
                const error = channel ? missingChannelPermissions(channel, guild.members.me, SEND_EMBED_PERMISSIONS) : CHANNEL_GONE;
                if (!error) updateGuildConfig(guild.id, { [channelKey]: channel.id });
                const pausedNote = config[offKey] ? " They're paused; press ▶️ Resume to turn them back on." : "";
                return interaction.update(section.view(interaction, error ?? `✅ ${label} messages will be sent in ${channel}.${pausedNote}`));
            }
            if (action === "text") {
                const title = new TextInputBuilder()
                    .setCustomId("title").setLabel("Title (leave empty for the default)").setStyle(TextInputStyle.Short)
                    .setMaxLength(256).setRequired(false).setPlaceholder(defaultTitle.slice(0, 100));
                const message = new TextInputBuilder()
                    .setCustomId("message").setLabel("Message (leave empty for the default)").setStyle(TextInputStyle.Paragraph)
                    .setMaxLength(1000).setRequired(false).setPlaceholder(defaultMessage.slice(0, 100));
                if (config[titleKey]) title.setValue(config[titleKey]);
                if (config[messageKey]) message.setValue(config[messageKey]);
                return interaction.showModal(new ModalBuilder()
                    .setCustomId(`setup:${id}:text`)
                    .setTitle(`${label} text`)
                    .addComponents(new ActionRowBuilder().addComponents(title), new ActionRowBuilder().addComponents(message)));
            }
            if (action === "preview") {
                // Shown with the person clicking standing in for the member
                return interaction.reply({
                    embeds: [buildGreetingEmbed(interaction.member, config[messageKey] || defaultMessage, joining, config[titleKey])],
                    flags: MessageFlags.Ephemeral,
                });
            }
            if (action === "pause") {
                const result = togglePause(guild.id, id);
                const notice = {
                    paused: `⏸️ ${label} messages paused. Your settings are kept.`,
                    resumed: `▶️ ${label} messages resumed.`,
                }[result] ?? "❌ Pick a channel first.";
                return interaction.update(section.view(interaction, notice));
            }
            if (action === "disable") {
                updateGuildConfig(guild.id, { [channelKey]: null, [messageKey]: null, [titleKey]: null, [offKey]: null });
                return interaction.update(section.view(interaction, `✅ ${label} messages disabled.`));
            }
        },

        async handleModal(interaction, action) {
            if (action !== "text") return;
            const title = interaction.fields.getTextInputValue("title").trim() || null;
            const message = interaction.fields.getTextInputValue("message").trim() || null;
            const updated = updateGuildConfig(interaction.guild.id, { [titleKey]: title, [messageKey]: message });
            const notice = updated[channelKey] ? "✅ Text saved." : "✅ Text saved. Pick a channel to turn it on.";
            return interaction.update(section.view(interaction, notice));
        },
    };
    return section;
}

module.exports = { greetingSection };
