const {
    PermissionFlagsBits, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder, RoleSelectMenuBuilder, UserSelectMenuBuilder,
} = require("discord.js");
const { getGuildConfig, updateGuildConfig } = require("../../guildConfig");
const { COMMAND_KEYS } = require("../../access");
const { sectionView, buttonRow, button } = require("../ui");

const MAX_MODS = 25;
const PANEL_LABELS = { setup: "/setup dashboard", mod: "/mod panel" };

// Entries are keyed "r-<roleId>" or "u-<userId>" in custom ids
const keyOf = entry => `${entry.type[0]}-${entry.id}`;
const mention = entry => (entry.type === "role" ? `<@&${entry.id}>` : `<@${entry.id}>`);
const entriesOf = guildId => getGuildConfig(guildId).botMods ?? [];
const findEntry = (guildId, key) => entriesOf(guildId).find(entry => keyOf(entry) === key);

function nameOf(interaction, entry) {
    if (entry.type === "role") return `@${interaction.guild.roles.cache.get(entry.id)?.name ?? entry.id}`;
    return interaction.guild.members.cache.get(entry.id)?.user.tag ?? interaction.client.users?.cache.get(entry.id)?.tag ?? entry.id;
}

function saveEntries(guildId, entries) {
    updateGuildConfig(guildId, { botMods: entries.length ? entries : null });
}

function listView(interaction, notice) {
    const entries = entriesOf(interaction.guild.id);
    const description = [
        "Bot mods can use the moderation commands, the **/mod** panel and most **/setup** sections without needing Discord permissions. Admins can always do everything.",
        "Pick a mod below to block commands for them.",
        "",
        entries.length
            ? entries.map(e => `• ${mention(e)}${e.blocked?.length ? ` · blocked: ${e.blocked.join(", ")}` : ""}`).join("\n").slice(0, 3000)
            : "*No bot mods yet.*",
        "",
        "💡 To let a mod role see slash commands like **/ban** or **/mod** in the command list, allow that role in **Server Settings → Integrations → this bot**.",
    ].join("\n");
    return sectionView(section, description, [
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder()
            .setCustomId("setup:botmods:addroles").setPlaceholder("Add mod roles…").setMaxValues(10)),
        new ActionRowBuilder().addComponents(new UserSelectMenuBuilder()
            .setCustomId("setup:botmods:addusers").setPlaceholder("Add mod users…").setMaxValues(10)),
        entries.length && new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId("setup:botmods:edit")
            .setPlaceholder("Block commands for a mod…")
            .addOptions(entries.map(e => ({ label: nameOf(interaction, e).slice(0, 100), description: e.type, value: keyOf(e) })))),
        buttonRow(),
    ].filter(Boolean), notice);
}

function editView(interaction, notice, key) {
    const entry = findEntry(interaction.guild.id, key);
    if (!entry) return listView(interaction, "❌ That mod is no longer on the list.");
    const description = [
        `**Mod:** ${mention(entry)}`,
        `**Blocked:** ${entry.blocked?.length ? entry.blocked.map(c => PANEL_LABELS[c] ?? `/${c}`).join(", ") : "*nothing*"}`,
        "",
        "Pick the commands this mod must not use. Blocking **/mod panel** or **/setup dashboard** hides that whole panel.",
    ].join("\n");
    return sectionView(section, description, [
        new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId(`setup:botmods:block:${key}`)
            .setPlaceholder("Blocked commands…")
            .setMinValues(0)
            .setMaxValues(COMMAND_KEYS.length)
            .addOptions(COMMAND_KEYS.map(c => ({ label: PANEL_LABELS[c] ?? `/${c}`, value: c, default: !!entry.blocked?.includes(c) })))),
        buttonRow(
            button(`setup:botmods:removemod:${key}`, "Remove from mods", ButtonStyle.Danger),
            button("setup:botmods:list", "◀ Back"),
        ),
    ], notice);
}

// Adds new entries, skipping ones already listed; returns how many were added or an error
function addEntries(interaction, type, ids) {
    const entries = entriesOf(interaction.guild.id);
    const fresh = ids
        .filter(id => !(type === "role" && id === interaction.guild.id))
        .filter(id => !entries.some(e => e.type === type && e.id === id))
        .map(id => ({ type, id, blocked: [] }));
    if (entries.length + fresh.length > MAX_MODS) return { error: `❌ There can be at most ${MAX_MODS} bot mods.` };
    saveEntries(interaction.guild.id, [...entries, ...fresh]);
    return { added: fresh.length };
}

const section = {
    id: "botmods",
    label: "Bot mods",
    emoji: "👮",
    // Only admins decide who gets mod powers
    permission: PermissionFlagsBits.Administrator,

    status: config => {
        const count = config.botMods?.length ?? 0;
        return count ? `${count} mod role(s)/user(s)` : "none";
    },

    view(interaction, notice, key) {
        return key ? editView(interaction, notice, key) : listView(interaction, notice);
    },

    async handleComponent(interaction, action, key) {
        const guildId = interaction.guild.id;
        if (action === "list") return interaction.update(listView(interaction));
        if (action === "edit") return interaction.update(editView(interaction, undefined, interaction.values[0]));
        if (action === "addroles" || action === "addusers") {
            const result = addEntries(interaction, action === "addroles" ? "role" : "user", interaction.values);
            return interaction.update(listView(interaction, result.error ?? `✅ Added ${result.added} bot mod(s).`));
        }

        const entry = findEntry(guildId, key);
        if (!entry) return interaction.update(listView(interaction, "❌ That mod is no longer on the list."));
        if (action === "block") {
            const blocked = interaction.values.filter(c => COMMAND_KEYS.includes(c));
            saveEntries(guildId, entriesOf(guildId).map(e => (keyOf(e) === key ? { ...e, blocked } : e)));
            return interaction.update(editView(interaction, `✅ Blocked ${blocked.length} command(s).`, key));
        }
        if (action === "removemod") {
            saveEntries(guildId, entriesOf(guildId).filter(e => keyOf(e) !== key));
            return interaction.update(listView(interaction, `✅ Removed ${mention(entry)} from the bot mods.`));
        }
    },
};

module.exports = section;
