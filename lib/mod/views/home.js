const {
    PermissionFlagsBits: P, ActionRowBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require("discord.js");
const { getHistory, formatEntry } = require("../../modHistory");
const { button, rowOf, modEmbed, panel, can } = require("../ui");

const NO_USER = "❌ I can't find a user with that ID.";

async function homeView(interaction, notice) {
    const { guild } = interaction;
    const timedOut = guild.members.cache.filter(m => m.communicationDisabledUntilTimestamp > Date.now()).size;
    const bans = can(interaction, P.BanMembers, "ban") ? await guild.bans.fetch().then(b => (b.size >= 1000 ? "1000+" : `${b.size}`), () => "?") : "?";
    const recent = getHistory(guild.id, { limit: 5 }).map(formatEntry);

    const embed = modEmbed(`🛡️ Moderation · ${guild.name}`)
        .setDescription(recent.length ? `**Recent actions**\n${recent.join("\n")}` : "No moderation actions yet.")
        .addFields(
            { name: "Timed out", value: `${timedOut}`, inline: true },
            { name: "Bans", value: bans, inline: true },
        )
        .setFooter({ text: "Only you can see this panel. Results are posted in the channel." });
    return panel(embed, [
        new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId("mod:home:user").setPlaceholder("Pick a member…")),
        rowOf(
            can(interaction, P.ModerateMembers) && button("mod:home:byid", "🔎 User by ID"),
            can(interaction, P.BanMembers, "ban") && button("mod:bans:show", "🚫 Bans"),
            (can(interaction, P.ManageMessages, "purge") || can(interaction, P.ManageChannels, "lock") || can(interaction, P.ManageChannels, "slowmode")) && button("mod:channel:show", "💬 Channel tools"),
            can(interaction, P.ModerateMembers) && button("mod:history:show", "📜 History"),
        ),
    ], notice);
}

// The user view is required on demand because it also links back here
const userView = (...args) => require("./user").userView(...args);

module.exports = {
    homeView,
    NO_USER,
    view: {
        id: "home",
        actions: { show: null, user: P.ModerateMembers, byid: P.ModerateMembers },

        async handleComponent(interaction, action) {
            if (action === "show") return interaction.update(await homeView(interaction));
            if (action === "user") return interaction.update(await userView(interaction, interaction.values[0]));
            if (action === "byid") {
                return interaction.showModal(new ModalBuilder()
                    .setCustomId("mod:home:byid")
                    .setTitle("Find a user")
                    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
                        .setCustomId("id").setLabel("User ID").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20))));
            }
        },

        async handleModal(interaction, action) {
            if (action !== "byid") return;
            const id = interaction.fields.getTextInputValue("id").trim();
            if (!/^\d{17,20}$/.test(id)) return interaction.update(await homeView(interaction, NO_USER));
            return interaction.update(await userView(interaction, id));
        },
    },
};
