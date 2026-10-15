const { PermissionFlagsBits } = require("discord.js");
const { getGuildConfig } = require("./guildConfig");

// What a bot mod can be blocked from in /setup → Bot mods: commands (and the /mod panel), and /setup sections.
// Two groups so each fits in one menu (25 options).
const COMMAND_GROUPS = {
    commands: ["mod", "ban", "unban", "kick", "softban", "timeout", "warn", "warnings", "purge", "lock", "slowmode", "role", "say", "embed"],
    setup: [
        "setup", "welcome", "goodbye", "logs", "honeypot", "automod", "autorole", "restoreroles", "faqmanage", "selfroles",
        "joinwhitelist", "embeds", "prefix",
    ],
};
const COMMAND_KEYS = [...COMMAND_GROUPS.commands, ...COMMAND_GROUPS.setup];

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

// Like hasAccess, for a specific channel: people need the permission there, and bot mods must at least see it
function hasChannelAccess(interaction, channel, permission, command) {
    if (isAdmin(interaction)) return true;
    const inChannel = channel.permissionsFor?.(interaction.member);
    if (modEntries(interaction).length) return hasAccess(interaction, permission, command) && !!inChannel?.has(PermissionFlagsBits.ViewChannel);
    return !!inChannel?.has(permission);
}

// Whether giving out `role` would hand someone permissions the member doesn't have themselves.
// Only bot mods are limited this way; people with Manage Roles follow Discord's own rules.
function grantsMoreThanMember(interaction, role) {
    if (isAdmin(interaction) || interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) return false;
    return !!role.permissions && !interaction.memberPermissions?.has(role.permissions);
}

// Discord already decided who can run a slash command; this only applies bot mod blocks on top
function isBlocked(interaction, command) {
    if (isAdmin(interaction)) return false;
    const entries = modEntries(interaction);
    return entries.length > 0 && entries.every(entry => entry.blocked?.includes(command));
}

module.exports = { COMMAND_GROUPS, COMMAND_KEYS, hasAccess, hasChannelAccess, isBlocked, grantsMoreThanMember };
