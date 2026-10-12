const { AuditLogEvent, PermissionFlagsBits } = require("discord.js");
const { loadJsonFile } = require("./jsonFile");

// Who added the bot to each server, read from the audit log when it joins.
// Audit logs only go back 45 days, so servers joined earlier may stay unknown.
const store = loadJsonFile("bot-guilds");

async function findAdder(guild) {
    if (!guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) return null;
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 20 }).catch(() => null);
    return logs?.entries.find(entry => entry.targetId === guild.client.user.id)?.executorId ?? null;
}

async function recordJoin(guild) {
    store.data[guild.id] = { addedBy: await findAdder(guild), joinedAt: guild.joinedTimestamp };
    store.save();
    return store.data[guild.id];
}

function getJoinInfo(guildId) {
    return store.data[guildId] ?? null;
}

// Retries the audit log for servers where the adder is still unknown
async function refreshJoinInfo(guild) {
    const known = getJoinInfo(guild.id);
    return known?.addedBy ? known : recordJoin(guild);
}

function forgetGuild(guildId) {
    delete store.data[guildId];
    store.save();
}

module.exports = { recordJoin, getJoinInfo, refreshJoinInfo, forgetGuild };
