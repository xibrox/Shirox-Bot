const { PermissionFlagsBits: P, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const { getHistory, formatEntry, HISTORY_EMOJI } = require("../../modHistory");
const { homeButton, rowOf, modEmbed, panel } = require("../ui");

async function historyView(interaction, notice) {
    const entries = getHistory(interaction.guild.id, { limit: 25 });
    const embed = modEmbed("📜 Moderation history")
        .setDescription((entries.map(formatEntry).join("\n") || "No moderation actions yet.").slice(0, 4000));
    // One menu entry per user, newest action first
    const users = [...new Map(entries.filter(e => e.targetId).map(e => [e.targetId, e])).values()];
    return panel(embed, [
        users.length && new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId("mod:user:show")
            .setPlaceholder("Open a user…")
            .addOptions(users.map(e => ({
                label: `${e.type} · ${interaction.client.users?.cache.get(e.targetId)?.tag ?? e.targetId}`.slice(0, 100),
                emoji: { name: HISTORY_EMOJI[e.type] ?? "•" },
                value: e.targetId,
            })))),
        rowOf(homeButton()),
    ], notice);
}

module.exports = {
    view: {
        id: "history",
        actions: { show: P.ModerateMembers },
        async handleComponent(interaction, action) {
            if (action === "show") return interaction.update(await historyView(interaction));
        },
    },
};
