const {
    PermissionFlagsBits, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require("discord.js");
const { getGuildConfig, updateGuildConfig } = require("../../guildConfig");
const { sectionView, buttonRow, button, toggleButton } = require("../ui");

const idsOf = config => config.joinWhitelistIds ?? [];
const nameOf = (interaction, id) => interaction.guild.members.cache.get(id)?.user.tag ?? interaction.client.users?.cache.get(id)?.tag ?? id;

// Adds ids to the list, keeping it free of duplicates; returns how many were new
function addIds(guildId, ids) {
    const list = idsOf(getGuildConfig(guildId));
    const fresh = [...new Set(ids)].filter(id => !list.includes(id));
    updateGuildConfig(guildId, { joinWhitelistIds: [...list, ...fresh] });
    return fresh.length;
}

const section = {
    id: "joinwhitelist",
    label: "Join whitelist",
    emoji: "🔐",
    permission: PermissionFlagsBits.ManageGuild,

    status: config => (config.joinWhitelist ? `on · ${idsOf(config).length} allowed` : "off"),

    view(interaction, notice) {
        const config = getGuildConfig(interaction.guild.id);
        const ids = idsOf(config);
        const shown = ids.slice(0, 25);
        const description = [
            "Only people on this list can join. Anyone else is DMed and kicked. Bots always get in.",
            "",
            `**Status:** ${config.joinWhitelist ? "✅ on" : "❌ off"}`,
            `**Allowed:** ${ids.length}`,
            shown.length ? shown.map(id => `<@${id}>`).join(" ") + (ids.length > shown.length ? ` …and ${ids.length - shown.length} more` : "") : "*nobody yet*",
        ].join("\n");
        return sectionView(section, description, [
            shown.length && new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
                .setCustomId("setup:joinwhitelist:remove")
                .setPlaceholder("Remove someone…")
                .addOptions(shown.map(id => ({ label: nameOf(interaction, id).slice(0, 100), description: id, value: id })))),
            new ActionRowBuilder().addComponents(
                toggleButton("setup:joinwhitelist:toggle", "Whitelist", !!config.joinWhitelist),
                button("setup:joinwhitelist:add", "➕ Add users"),
                button("setup:joinwhitelist:addmembers", "👥 Add current members"),
            ),
            buttonRow(button("setup:joinwhitelist:clear", "Clear list", ButtonStyle.Danger).setDisabled(!ids.length)),
        ].filter(Boolean), notice);
    },

    async handleComponent(interaction, action) {
        const { guild } = interaction;
        const config = getGuildConfig(guild.id);

        if (action === "toggle") {
            if (config.joinWhitelist) {
                updateGuildConfig(guild.id, { joinWhitelist: null });
                return interaction.update(section.view(interaction, "🔓 Join whitelist off. Anyone can join again."));
            }
            let error = null;
            if (!idsOf(config).length) error = "❌ Add some users first, or everyone who joins would be kicked.";
            else if (!guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) error = "❌ I need the **Kick Members** permission for this.";
            if (!error) updateGuildConfig(guild.id, { joinWhitelist: true });
            return interaction.update(section.view(interaction, error ?? "🔐 Join whitelist on. Only listed people can join now."));
        }
        if (action === "add") {
            return interaction.showModal(new ModalBuilder()
                .setCustomId("setup:joinwhitelist:add")
                .setTitle("Add users to the whitelist")
                .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
                    .setCustomId("ids").setLabel("User IDs (any separator)").setStyle(TextInputStyle.Paragraph)
                    .setRequired(true).setMaxLength(4000).setPlaceholder("123456789012345678, 234567890123456789"))));
        }
        if (action === "addmembers") {
            const members = await guild.members.fetch().catch(() => guild.members.cache);
            const added = addIds(guild.id, [...members.values()].filter(m => !m.user.bot).map(m => m.id));
            return interaction.update(section.view(interaction, `✅ Added ${added} current member(s).`));
        }
        if (action === "remove") {
            const rest = idsOf(config).filter(id => id !== interaction.values[0]);
            // An empty whitelist with the feature on would kick everyone, so it switches off with the last person
            updateGuildConfig(guild.id, { joinWhitelistIds: rest.length ? rest : null, ...(!rest.length && { joinWhitelist: null }) });
            return interaction.update(section.view(interaction, rest.length ? "✅ Removed." : "✅ Removed. The list is empty, so the whitelist is off."));
        }
        if (action === "clear") {
            updateGuildConfig(guild.id, { joinWhitelist: null, joinWhitelistIds: null });
            return interaction.update(section.view(interaction, "✅ List cleared and whitelist turned off."));
        }
    },

    async handleModal(interaction, action) {
        if (action !== "add") return;
        const ids = interaction.fields.getTextInputValue("ids").match(/\d{17,20}/g) ?? [];
        if (!ids.length) return interaction.update(section.view(interaction, "❌ I couldn't find any user IDs in that."));
        const added = addIds(interaction.guild.id, ids);
        return interaction.update(section.view(interaction, `✅ Added ${added} user(s).`));
    },
};

module.exports = section;
