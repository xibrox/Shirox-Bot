const {
    PermissionFlagsBits, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require("discord.js");
const { getGuildConfig, updateGuildConfig } = require("../../guildConfig");
const { missingChannelPermissions, SEND_EMBED_PERMISSIONS } = require("../../channelChecks");
const { PLACEHOLDERS, buildGreetingEmbed } = require("../../greetings");
const { sectionView, channelPicker, buttonRow, button, channelText, pickedChannel, CHANNEL_GONE } = require("../ui");

// Welcome and goodbye work the same way and only differ in their settings keys and wording
function greetingSection({ id, label, emoji, joining, defaultMessage }) {
    const channelKey = `${id}ChannelId`;
    const messageKey = `${id}Message`;

    const section = {
        id,
        label,
        emoji,
        permission: PermissionFlagsBits.ManageGuild,

        status: config => (config[channelKey] ? `on · <#${config[channelKey]}>` : "off"),

        view(interaction, notice) {
            const config = getGuildConfig(interaction.guild.id);
            const description = [
                `**Channel:** ${channelText(config[channelKey])}`,
                `**Message:** ${config[messageKey] || `*default:* ${defaultMessage}`}`,
                "",
                `Placeholders: ${PLACEHOLDERS}`,
            ].join("\n");
            return sectionView(section, description, [
                channelPicker(`setup:${id}:channel`, config[channelKey], { placeholder: `Pick the ${id} channel…` }),
                buttonRow(
                    button(`setup:${id}:message`, "✏️ Edit message"),
                    button(`setup:${id}:preview`, "👁️ Preview"),
                    button(`setup:${id}:disable`, "Disable", ButtonStyle.Danger).setDisabled(!config[channelKey]),
                ),
            ], notice);
        },

        async handleComponent(interaction, action) {
            const { guild } = interaction;
            const config = getGuildConfig(guild.id);

            if (action === "channel") {
                const channel = pickedChannel(interaction);
                const error = channel ? missingChannelPermissions(channel, guild.members.me, SEND_EMBED_PERMISSIONS) : CHANNEL_GONE;
                if (!error) updateGuildConfig(guild.id, { [channelKey]: channel.id });
                return interaction.update(section.view(interaction, error ?? `✅ ${label} messages will be sent in ${channel}.`));
            }
            if (action === "message") {
                const input = new TextInputBuilder()
                    .setCustomId("message")
                    .setLabel("Message (leave empty for the default)")
                    .setStyle(TextInputStyle.Paragraph)
                    .setMaxLength(1000)
                    .setRequired(false)
                    .setPlaceholder(defaultMessage.slice(0, 100));
                if (config[messageKey]) input.setValue(config[messageKey]);
                return interaction.showModal(new ModalBuilder()
                    .setCustomId(`setup:${id}:message`)
                    .setTitle(`${label} message`)
                    .addComponents(new ActionRowBuilder().addComponents(input)));
            }
            if (action === "preview") {
                // Shown with the person clicking standing in for the member
                return interaction.reply({
                    embeds: [buildGreetingEmbed(interaction.member, config[messageKey] || defaultMessage, joining)],
                    flags: MessageFlags.Ephemeral,
                });
            }
            if (action === "disable") {
                updateGuildConfig(guild.id, { [channelKey]: null, [messageKey]: null });
                return interaction.update(section.view(interaction, `✅ ${label} messages disabled.`));
            }
        },

        async handleModal(interaction, action) {
            if (action !== "message") return;
            const message = interaction.fields.getTextInputValue("message").trim() || null;
            const updated = updateGuildConfig(interaction.guild.id, { [messageKey]: message });
            const notice = updated[channelKey] ? "✅ Message saved." : "✅ Message saved. Pick a channel to turn it on.";
            return interaction.update(section.view(interaction, notice));
        },
    };
    return section;
}

module.exports = { greetingSection };
