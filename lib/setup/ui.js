const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ChannelType, EmbedBuilder,
} = require("discord.js");
const { EMBED_COLOR } = require("../colors");

const HOME_ID = "setup:home:show";
const TEXT_CHANNELS = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const CHANNEL_GONE = "❌ I can't see that channel.";

function button(customId, label, style = ButtonStyle.Secondary) {
    return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

// Green when on, grey when off; clicking it flips the setting
function toggleButton(customId, label, on) {
    return button(customId, `${label}: ${on ? "on" : "off"}`, on ? ButtonStyle.Success : ButtonStyle.Secondary);
}

// A section's last row: up to 4 of its own buttons, then ◀ Home
function buttonRow(...buttons) {
    return new ActionRowBuilder().addComponents(...buttons, button(HOME_ID, "◀ Home"));
}

function channelPicker(customId, selectedId, { placeholder = "Pick a channel…", types = TEXT_CHANNELS } = {}) {
    const menu = new ChannelSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).setChannelTypes(...types);
    if (selectedId) menu.setDefaultChannels([selectedId]);
    return new ActionRowBuilder().addComponents(menu);
}

function rolePicker(customId, selectedIds = [], { placeholder = "Pick a role…", max = 1 } = {}) {
    const menu = new RoleSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).setMaxValues(max);
    if (selectedIds.length) menu.setDefaultRoles(selectedIds);
    return new ActionRowBuilder().addComponents(menu);
}

// A full update payload for a section; `notice` is a result or error line shown above the embed
function sectionView(section, description, components, notice) {
    const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTitle(`${section.emoji} ${section.label}`).setDescription(description);
    return { content: notice ?? "", embeds: [embed], components };
}

const channelText = id => (id ? `<#${id}>` : "*not set*");
const roleText = id => (id ? `<@&${id}>` : "*not set*");

// The channel picked in a channel menu, from the server's cache (undefined if it was deleted)
const pickedChannel = interaction => interaction.guild.channels.cache.get(interaction.values[0]);

module.exports = {
    HOME_ID, TEXT_CHANNELS, CHANNEL_GONE,
    button, toggleButton, buttonRow, channelPicker, rolePicker, sectionView, channelText, roleText, pickedChannel,
};
