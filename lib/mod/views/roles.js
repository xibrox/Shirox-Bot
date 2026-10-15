const { PermissionFlagsBits: P, ActionRowBuilder, RoleSelectMenuBuilder } = require("discord.js");
const { changeRoles } = require("../../modActions");
const { button, homeButton, rowOf, modEmbed, panel, fetchMember, finishAction } = require("../ui");

const userView = (...args) => require("./user").userView(...args);

async function rolesView(interaction, userId, notice) {
    const member = await fetchMember(interaction.guild, userId);
    if (!member) return userView(interaction, userId, "❌ That user is not in this server.");
    const roles = member.roles.cache.filter(r => r.id !== interaction.guild.id).map(String).join(" ") || "*none*";
    const picker = (action, placeholder) => new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder()
        .setCustomId(`mod:roles:${action}:${userId}`).setPlaceholder(placeholder).setMaxValues(10));
    return panel(modEmbed(`🎭 Roles · ${member.user.tag}`).setDescription(roles.slice(0, 4000)), [
        picker("give", "Give roles…"),
        picker("take", "Remove roles…"),
        rowOf(button(`mod:user:show:${userId}`, "◀ Back"), homeButton()),
    ], notice);
}

module.exports = {
    view: {
        id: "roles",
        actions: { show: P.ManageRoles, give: P.ManageRoles, take: P.ManageRoles },

        async handleComponent(interaction, action, userId) {
            if (action === "show") return interaction.update(await rolesView(interaction, userId));
            const member = await fetchMember(interaction.guild, userId);
            const roles = interaction.values.map(id => interaction.guild.roles.cache.get(id)).filter(Boolean);
            const result = await changeRoles(interaction, member, roles, action === "give");
            return finishAction(interaction, result, notice => rolesView(interaction, userId, notice));
        },
    },
};
