const { EmbedBuilder, AuditLogEvent, PermissionFlagsBits } = require("discord.js");
const { getGuildConfig } = require("./guildConfig");
const { COLORS } = require("./colors");
const { isActive } = require("./features");

// IDs (users or messages) the bot is acting on itself, e.g. a honeypot soft ban. The generic
// ban/unban/leave/delete logs skip them because the action already logs one clear entry.
const suppressedUsers = new Set();

function suppressLogsFor(userId, ms = 15_000) {
    suppressedUsers.add(userId);
    setTimeout(() => suppressedUsers.delete(userId), ms);
}

function isSuppressed(userId) {
    return suppressedUsers.has(userId);
}

// `type` is a palette key from lib/colors.js: danger, warning, success, update or default
function createLogEmbed(type, title) {
    return new EmbedBuilder().setColor(COLORS[type] || COLORS.default).setTitle(title).setTimestamp();
}

// Kinds of log entries a server can switch off in /setup → Logs
const LOG_TYPES = [
    { id: "messages", label: "Messages", emoji: "💬" },
    { id: "members", label: "Members", emoji: "👥" },
    { id: "moderation", label: "Moderation", emoji: "🛡️" },
    { id: "server", label: "Server", emoji: "🏠" },
    { id: "voice", label: "Voice", emoji: "🔊" },
];

// `type` is one of LOG_TYPES' ids
async function sendLog(guild, type, embed, files = []) {
    const config = getGuildConfig(guild.id);
    if (!isActive(config, "logs") || config.logTypesOff?.includes(type)) return;
    const channel = guild.channels.cache.get(config.logChannelId);
    if (!channel?.isTextBased()) return;
    await channel.send({ embeds: [embed], files }).catch(err =>
        console.error(`Failed to send log in ${guild.name}:`, err.message));
}

// Looks up who performed a recent action on `targetId` (needs View Audit Log). Returns the entry or null.
async function findAuditEntry(guild, type, targetId, maxAgeMs = 10_000) {
    if (!guild.members.me.permissions.has(PermissionFlagsBits.ViewAuditLog)) return null;
    const logs = await guild.fetchAuditLogs({ type, limit: 5 }).catch(() => null);
    return logs?.entries.find(e => e.targetId === targetId && Date.now() - e.createdTimestamp < maxAgeMs) || null;
}

function truncate(text, max = 1000) {
    if (!text) return "*empty*";
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

function userField(user) {
    return `${user} (\`${user.tag ?? user.username}\` · ${user.id})`;
}

module.exports = {
    AuditLogEvent,
    LOG_TYPES,
    createLogEmbed,
    sendLog,
    findAuditEntry,
    truncate,
    userField,
    suppressLogsFor,
    isSuppressed,
};
