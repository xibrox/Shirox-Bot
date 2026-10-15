const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { EMBED_COLOR } = require("./colors");

// Two rows of five buttons
const MAX_SELF_ROLES = 10;

// The panel members click to toggle roles; buttons are "selfrole:<roleId>", handled by commands/selfroles.js
function buildSelfRolePanel(title, description, roles) {
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(title)
        .setDescription(`${description || "Click a button to get or remove a role."}\n\n${roles.map(r => `• ${r}`).join("\n")}`);

    const buttons = roles.map(role => new ButtonBuilder()
        .setCustomId(`selfrole:${role.id}`)
        .setLabel(role.name.slice(0, 80))
        .setStyle(ButtonStyle.Secondary));
    const components = [];
    for (let i = 0; i < buttons.length; i += 5) {
        components.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }
    return { embeds: [embed], components };
}

module.exports = { MAX_SELF_ROLES, buildSelfRolePanel };
