const { PermissionFlagsBits, ButtonStyle } = require("discord.js");
const { getGuildConfig, updateGuildConfig } = require("../../guildConfig");
const { checkAssignableRole } = require("../../moderation");
const { sectionView, rolePicker, buttonRow, button, roleText, savedRoles } = require("../ui");

// Which picker / clear button changes which setting
const TARGETS = {
    members: { key: "autoRoleId", label: "new members" },
    bots: { key: "botAutoRoleId", label: "new bots" },
};

const section = {
    id: "autorole",
    label: "Auto role",
    emoji: "👤",
    permission: PermissionFlagsBits.ManageRoles,

    status: config => [
        config.autoRoleId && `members <@&${config.autoRoleId}>`,
        config.botAutoRoleId && `bots <@&${config.botAutoRoleId}>`,
    ].filter(Boolean).join(" · ") || "off",

    view(interaction, notice) {
        const c = getGuildConfig(interaction.guild.id);
        const description = [
            "Gives new members (and new bots) a role when they join.",
            "",
            `**Members:** ${roleText(c.autoRoleId)}`,
            `**Bots:** ${roleText(c.botAutoRoleId)}`,
        ].join("\n");
        return sectionView(section, description, [
            rolePicker("setup:autorole:members", savedRoles(interaction.guild, c.autoRoleId), { placeholder: "Role for new members…" }),
            rolePicker("setup:autorole:bots", savedRoles(interaction.guild, c.botAutoRoleId), { placeholder: "Role for new bots…" }),
            buttonRow(
                button("setup:autorole:clear:members", "Disable for members", ButtonStyle.Danger).setDisabled(!c.autoRoleId),
                button("setup:autorole:clear:bots", "Disable for bots", ButtonStyle.Danger).setDisabled(!c.botAutoRoleId),
            ),
        ], notice);
    },

    async handleComponent(interaction, action, arg) {
        const { guild } = interaction;

        if (Object.hasOwn(TARGETS, action)) {
            const { key, label } = TARGETS[action];
            const role = guild.roles.cache.get(interaction.values[0]);
            const error = role ? checkAssignableRole(interaction, role) : "❌ I can't find that role.";
            if (!error) updateGuildConfig(guild.id, { [key]: role.id });
            return interaction.update(section.view(interaction, error ?? `✅ ${role} will now be given to ${label}.`));
        }
        if (action === "clear" && Object.hasOwn(TARGETS, arg)) {
            const { key, label } = TARGETS[arg];
            updateGuildConfig(guild.id, { [key]: null });
            return interaction.update(section.view(interaction, `✅ Auto role for ${label} disabled.`));
        }
    },
};

module.exports = section;
