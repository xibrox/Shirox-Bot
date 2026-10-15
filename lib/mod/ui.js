const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require("discord.js");
const { EMBED_COLOR } = require("../colors");
const { permissionNames, listText } = require("../permissions");

const OUT_OF_DATE = { content: "⚠️ This panel is out of date. Run /mod again.", flags: MessageFlags.Ephemeral };

const button = (customId, label, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
const homeButton = () => button("mod:home:show", "◀ Home");

// A row of the buttons that are shown (falsy entries are left out), or null if none are
function rowOf(...buttons) {
    const shown = buttons.filter(Boolean);
    return shown.length ? new ActionRowBuilder().addComponents(shown) : null;
}

const modEmbed = title => new EmbedBuilder().setColor(EMBED_COLOR).setTitle(title);

// A full update payload; `notice` is a result or error line shown above the embed
const panel = (embed, rows, notice) => ({ content: notice ?? "", embeds: [embed], components: rows.filter(Boolean) });

const can = (interaction, permission) => !!interaction.memberPermissions?.has(permission);

const permissionReply = permission => ({
    content: `❌ You need **${listText(permissionNames(permission))}** for this.`,
    flags: MessageFlags.Ephemeral,
});

// The member if they're in the server, otherwise null
async function fetchMember(guild, userId) {
    return guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(() => null);
}

// Posts an action's public line, then re-renders the panel with the outcome as its notice
async function finishAction(interaction, result, render, channel = interaction.channel) {
    if (result.publicLine) await channel?.send({ content: result.publicLine, allowedMentions: { parse: [] } }).catch(() => {});
    return interaction.update(await render(result.error ?? result.notice ?? result.publicLine));
}

module.exports = { OUT_OF_DATE, button, homeButton, rowOf, modEmbed, panel, can, permissionReply, fetchMember, finishAction };
