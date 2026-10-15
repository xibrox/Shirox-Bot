const { PermissionFlagsBits: P, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const { button, homeButton, rowOf, modEmbed, panel } = require("../ui");

const homeView = (...args) => require("./home").homeView(...args);

async function bansView(interaction, notice) {
    const bans = await interaction.guild.bans.fetch().catch(() => null);
    if (!bans) return homeView(interaction, "❌ I couldn't load the ban list. Do I have **Ban Members**?");
    const shown = [...bans.values()].slice(0, 25);
    const lines = shown.map(b => `**${b.user.tag}** · ${(b.reason || "no reason").slice(0, 100)}`);
    // Discord returns at most 1000 bans per request
    const count = bans.size >= 1000 ? "1000+" : `${bans.size}`;
    const embed = modEmbed(`🚫 Bans (${count})`)
        .setDescription((lines.join("\n") || "Nobody is banned.").slice(0, 4000) +
            (bans.size > shown.length ? `\n…showing ${shown.length} of ${count}. Use 🔎 User by ID for others.` : ""));
    return panel(embed, [
        shown.length && new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId("mod:user:show")
            .setPlaceholder("Open a banned user…")
            .addOptions(shown.map(b => ({ label: b.user.tag.slice(0, 100), value: b.user.id })))),
        rowOf(button("mod:home:byid", "🔎 User by ID"), homeButton()),
    ], notice);
}

module.exports = {
    view: {
        id: "bans",
        actions: { show: P.BanMembers },
        async handleComponent(interaction, action) {
            if (action === "show") return interaction.update(await bansView(interaction));
        },
    },
};
