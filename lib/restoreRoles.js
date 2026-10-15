const { PermissionFlagsBits } = require("discord.js");
const { updateGuildConfig } = require("./guildConfig");

const RESTORE_RULES = [
    "When a member leaves, their roles and nickname are saved and given back if they rejoin.",
    "• Banned members are never restored.",
    "• Roles with **Administrator**, or above my highest role, are skipped for safety.",
    "• Only members who leave *after* enabling this are saved.",
].join("\n");

const AUTOROLE_NOTE = "ℹ️ Your auto role will still be given to everyone who joins, including returning members.";

// Turns role restore on or off. Returns an error message, or null when saved.
function setRestoreRoles(guild, enabled) {
    if (enabled && !guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return "❌ I need the **Manage Roles** permission for this.";
    }
    updateGuildConfig(guild.id, { restoreRoles: enabled || null });
    // Cache everyone's roles now so members who leave before ever being seen still get saved
    if (enabled) guild.members.fetch().catch(() => {});
    return null;
}

module.exports = { setRestoreRoles, RESTORE_RULES, AUTOROLE_NOTE };
