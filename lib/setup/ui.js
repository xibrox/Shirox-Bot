const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ChannelType, EmbedBuilder,
} = require("discord.js");
const { EMBED_COLOR } = require("../colors");
const { getGuildConfig, updateGuildConfig } = require("../guildConfig");
const { FEATURES, featureState } = require("../features");

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

// A saved channel/role id, or nothing if it has since been deleted, so menus never preselect a dead id
const savedChannel = (guild, id) => (id && guild.channels.cache.has(id) ? id : null);
const savedRoles = (guild, ...ids) => ids.filter(id => id && guild.roles.cache.has(id));

// The channel picked in a channel menu, from the server's cache (undefined if it was deleted)
const pickedChannel = interaction => interaction.guild.channels.cache.get(interaction.values[0]);

const STATE_TEXT = { on: "✅ on", paused: "⏸️ paused", off: "❌ off" };

// ⏸️ Pause while running, ▶️ Resume while paused; nothing to pause until a channel is set
function pauseButton(customId, state) {
    const paused = state === "paused";
    return button(customId, paused ? "▶️ Resume" : "⏸️ Pause", paused ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(state === "off");
}

// Clears a feature's settings (pausing keeps them)
function disableButton(customId, enabled, label = "Disable") {
    return button(customId, label, ButtonStyle.Danger).setDisabled(!enabled);
}

// Home status line for a channel feature
function featureStatus(config, feature) {
    const state = featureState(config, feature);
    return state === "off" ? "off" : `${state} · <#${config[FEATURES[feature].channelKey]}>`;
}

// Flips a feature between paused and running. Returns "paused", "resumed", or null if it has no channel.
function togglePause(guildId, feature) {
    const config = getGuildConfig(guildId);
    const state = featureState(config, feature);
    if (state === "off") return null;
    updateGuildConfig(guildId, { [FEATURES[feature].offKey]: state === "on" ? true : null });
    return state === "on" ? "paused" : "resumed";
}

module.exports = {
    HOME_ID, TEXT_CHANNELS, CHANNEL_GONE, STATE_TEXT,
    button, toggleButton, buttonRow, channelPicker, rolePicker, sectionView, channelText, roleText, pickedChannel,
    savedChannel, savedRoles, pauseButton, disableButton, featureStatus, togglePause,
};
