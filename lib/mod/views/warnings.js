const { PermissionFlagsBits: P, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const { getWarnings, removeWarning, clearWarnings } = require("../../warnings");
const { button, homeButton, rowOf, modEmbed, panel } = require("../ui");

async function warningsView(interaction, userId, notice, confirmClear = false) {
    const user = await interaction.client.users.fetch(userId).catch(() => null);
    const warnings = getWarnings(interaction.guild.id, userId).slice(-25).reverse();
    const lines = warnings.map(w => `**#${w.id}** · <t:${Math.floor(w.timestamp / 1000)}:R> by <@${w.moderatorId}>\n${w.reason.slice(0, 120)}`);
    const embed = modEmbed(`📋 Warnings · ${user?.tag ?? userId}`)
        .setDescription((lines.join("\n\n") || "No warnings.").slice(0, 4000));

    const rows = [];
    if (warnings.length) {
        rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId(`mod:warnings:remove:${userId}`)
            .setPlaceholder("Remove a warning…")
            .addOptions(warnings.map(w => ({ label: `#${w.id} · ${w.reason.slice(0, 80)}`, value: String(w.id) })))));
    }
    rows.push(confirmClear
        ? rowOf(
            button(`mod:warnings:confirmclear:${userId}`, "Confirm clear", ButtonStyle.Danger),
            button(`mod:warnings:cancel:${userId}`, "Cancel"),
            homeButton(),
        )
        : rowOf(
            button(`mod:warnings:clear:${userId}`, "🗑️ Clear all", ButtonStyle.Danger).setDisabled(!warnings.length),
            button(`mod:user:show:${userId}`, "◀ Back"),
            homeButton(),
        ));
    return panel(embed, rows, notice);
}

module.exports = {
    view: {
        id: "warnings",
        actions: { show: P.ModerateMembers, remove: P.ModerateMembers, clear: P.ModerateMembers, confirmclear: P.ModerateMembers, cancel: P.ModerateMembers },

        async handleComponent(interaction, action, userId) {
            const guildId = interaction.guild.id;
            if (action === "show" || action === "cancel") return interaction.update(await warningsView(interaction, userId));
            if (action === "clear") return interaction.update(await warningsView(interaction, userId, undefined, true));
            if (action === "remove") {
                const id = Number(interaction.values[0]);
                const notice = removeWarning(guildId, userId, id) ? `✅ Removed warning #${id}.` : "❌ That warning no longer exists.";
                return interaction.update(await warningsView(interaction, userId, notice));
            }
            if (action === "confirmclear") {
                const count = clearWarnings(guildId, userId);
                return interaction.update(await warningsView(interaction, userId, `✅ Cleared **${count}** warning(s).`));
            }
        },
    },
};
