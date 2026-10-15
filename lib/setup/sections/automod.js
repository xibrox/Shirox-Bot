const { PermissionFlagsBits, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { getGuildConfig, updateGuildConfig } = require("../../guildConfig");
const { sectionView, buttonRow, button, toggleButton } = require("../ui");

// [custom id part, settings key, button label]
const TOGGLES = [["invites", "automodInvites", "Invites"], ["links", "automodLinks", "Links"], ["spam", "automodSpam", "Spam"]];

const onOff = value => (value ? "✅ on" : "❌ off");

// Empty counts as 0; anything else must be a whole number from 0 to max. Returns null if invalid.
function parseLimit(text, max) {
    const value = text.trim() || "0";
    if (!/^\d+$/.test(value)) return null;
    const number = Number(value);
    return number <= max ? number : null;
}

function limitInput(id, label, value) {
    return new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setMaxLength(3).setRequired(false).setValue(String(value ?? 0)));
}

const section = {
    id: "automod",
    label: "Automod",
    emoji: "🛡️",
    permission: PermissionFlagsBits.ManageGuild,

    status(config) {
        const on = TOGGLES.filter(([, key]) => config[key]).length
            + (config.automodMentionLimit ? 1 : 0) + (config.automodMinAccountAgeDays ? 1 : 0);
        return on ? `${on} of 5 rules on` : "off";
    },

    view(interaction, notice) {
        const c = getGuildConfig(interaction.guild.id);
        const description = [
            "Staff with **Manage Messages** are ignored.",
            "",
            `🔗 **Invites:** ${onOff(c.automodInvites)}, deletes invite links to other servers`,
            `🌐 **Links:** ${onOff(c.automodLinks)}, deletes all links`,
            `💬 **Spam:** ${onOff(c.automodSpam)}, times out members who send 5+ messages within 5 seconds`,
            `📣 **Mention limit:** ${c.automodMentionLimit ? `**${c.automodMentionLimit}** per message` : "❌ off"}`,
            `🆕 **Minimum account age:** ${c.automodMinAccountAgeDays ? `**${c.automodMinAccountAgeDays} day(s)**` : "❌ off"}`,
        ].join("\n");
        return sectionView(section, description, [
            new ActionRowBuilder().addComponents(TOGGLES.map(([id, key, label]) => toggleButton(`setup:automod:toggle:${id}`, label, !!c[key]))),
            buttonRow(button("setup:automod:limits", "✏️ Limits")),
        ], notice);
    },

    async handleComponent(interaction, action, arg) {
        const { guild } = interaction;
        const config = getGuildConfig(guild.id);

        if (action === "toggle") {
            const toggle = TOGGLES.find(([id]) => id === arg);
            if (!toggle) return;
            const [, key, label] = toggle;
            updateGuildConfig(guild.id, { [key]: config[key] ? null : true });
            return interaction.update(section.view(interaction, `🛡️ ${label} filter: ${onOff(!config[key])}`));
        }
        if (action === "limits") {
            return interaction.showModal(new ModalBuilder()
                .setCustomId("setup:automod:limits")
                .setTitle("Automod limits")
                .addComponents(
                    limitInput("mentions", "Max mentions per message (0-50, 0 = off)", config.automodMentionLimit),
                    limitInput("age", "Minimum account age in days (0-365, 0 = off)", config.automodMinAccountAgeDays),
                ));
        }
    },

    async handleModal(interaction, action) {
        if (action !== "limits") return;
        const mentions = parseLimit(interaction.fields.getTextInputValue("mentions"), 50);
        const days = parseLimit(interaction.fields.getTextInputValue("age"), 365);
        if (mentions === null || days === null) {
            return interaction.update(section.view(interaction, "❌ Use whole numbers: mentions 0–50, account age 0–365."));
        }
        if (days && !interaction.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) {
            return interaction.update(section.view(interaction, "❌ I need the **Kick Members** permission for the account age rule."));
        }
        updateGuildConfig(interaction.guild.id, { automodMentionLimit: mentions || null, automodMinAccountAgeDays: days || null });
        return interaction.update(section.view(interaction, "✅ Limits saved."));
    },
};

module.exports = section;
