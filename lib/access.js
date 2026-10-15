const { PermissionFlagsBits } = require("discord.js");
const { getGuildConfig } = require("./guildConfig");

// Commands (and the two panels) a bot mod can be blocked from in /setup → Bot mods
const COMMAND_KEYS = [
    "setup", "mod", "ban", "unban", "kick", "softban", "timeout", "warn", "warnings", "purge", "lock", "slowmode",
    "role", "say", "embed", "welcome", "goodbye", "logs", "honeypot", "automod", "autorole", "restoreroles", "faqmanage", "selfroles",
];

const isAdmin = interaction => !!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

// The bot mod entries (roles or users from /setup → Bot mods) that apply to whoever is interacting
function modEntries(interaction) {
    const entries = getGuildConfig(interaction.guild.id).botMods ?? [];
    const roles = interaction.member?.roles?.cache;
    return entries.filter(entry => (entry.type === "user" ? entry.id === interaction.user.id : !!roles?.has(entry.id)));
}

// Whether the member may use something that needs `permission`. Admins always may. Bot mods may use
// anything short of Administrator unless every one of their mod entries blocks `command`; everyone
// else needs the Discord permission itself.
function hasAccess(interaction, permission, command) {
    if (isAdmin(interaction)) return true;
    const entries = modEntries(interaction);
    if (!entries.length) return !!interaction.memberPermissions?.has(permission);
    if (permission === PermissionFlagsBits.Administrator) return false;
    return entries.some(entry => !entry.blocked?.includes(command));
}

// Like hasAccess, but people without bot mod entries need the permission in that channel specifically
function hasChannelAccess(interaction, channel, permission, command) {
    if (isAdmin(interaction) || modEntries(interaction).length) return hasAccess(interaction, permission, command);
    return !!channel.permissionsFor?.(interaction.member)?.has(permission);
}

// Discord already decided who can run a slash command; this only applies bot mod blocks on top
function isBlocked(interaction, command) {
    if (isAdmin(interaction)) return false;
    const entries = modEntries(interaction);
    return entries.length > 0 && entries.every(entry => entry.blocked?.includes(command));
}

module.exports = { COMMAND_KEYS, hasAccess, hasChannelAccess, isBlocked };
