const { EmbedBuilder, AuditLogEvent, PermissionFlagsBits } = require("discord.js");
const { getGuildConfig } = require("./guildConfig");

const COLORS = {
    message: "#3498DB",
    member: "#2ECC71",
    leave: "#E67E22",
    moderation: "#E74C3C",
    server: "#9B59B6",
    voice: "#1ABC9C",
};

// Users the bot is honeypot-banning right now; ban/unban/leave logs skip them to avoid noise
const suppressedUsers = new Set();

function suppressLogsFor(userId, ms = 15_000) {
    suppressedUsers.add(userId);
    setTimeout(() => suppressedUsers.delete(userId), ms);
}

function isSuppressed(userId) {
    return suppressedUsers.has(userId);
}

function createLogEmbed(type, title) {
    return new EmbedBuilder().setColor(COLORS[type] || "#5865F2").setTitle(title).setTimestamp();
}

async function sendLog(guild, embed) {
    const channelId = getGuildConfig(guild.id).logChannelId;
    if (!channelId) return;
    const channel = guild.channels.cache.get(channelId);
    if (!channel?.isTextBased()) return;
    await channel.send({ embeds: [embed] }).catch(err =>
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
    createLogEmbed,
    sendLog,
    findAuditEntry,
    truncate,
    userField,
    suppressLogsFor,
    isSuppressed,
};
