const { PermissionFlagsBits } = require("discord.js");
const { getGuildConfig } = require("../../guildConfig");
const { setRestoreRoles, RESTORE_RULES, AUTOROLE_NOTE } = require("../../restoreRoles");
const { sectionView, buttonRow, toggleButton } = require("../ui");

const section = {
    id: "restoreroles",
    label: "Role restore",
    emoji: "♻️",
    command: "restoreroles",
    permission: PermissionFlagsBits.ManageGuild,

    status: config => (config.restoreRoles ? "on" : "off"),

    view(interaction, notice) {
        const on = !!getGuildConfig(interaction.guild.id).restoreRoles;
        const description = [
            "Gives members their old roles and nickname back when they leave and rejoin.",
            "",
            `**Status:** ${on ? "✅ on" : "❌ off"}`,
            "",
            RESTORE_RULES,
        ].join("\n");
        return sectionView(section, description, [buttonRow(toggleButton("setup:restoreroles:toggle", "Role restore", on))], notice);
    },

    async handleComponent(interaction, action) {
        if (action !== "toggle") return;
        const config = getGuildConfig(interaction.guild.id);
        const enabled = !config.restoreRoles;
        const error = setRestoreRoles(interaction.guild, enabled);
        const notice = error
            ?? (enabled ? `✅ Role restore enabled.${config.autoRoleId ? `\n${AUTOROLE_NOTE}` : ""}` : "✅ Role restore disabled.");
        return interaction.update(section.view(interaction, notice));
    },
};

module.exports = section;
