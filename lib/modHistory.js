const { loadJsonFile } = require("./jsonFile");

// { [guildId]: [{ type, targetId, moderatorId, reason, timestamp, extra }] }, oldest first
const store = loadJsonFile("mod-history");
const MAX_ENTRIES = 500;

const HISTORY_EMOJI = {
    warn: "⚠️", timeout: "🔇", untimeout: "🔊", kick: "👢", ban: "🔨", unban: "✅", softban: "🧹",
    purge: "🗑️", lock: "🔒", unlock: "🔓", slowmode: "🐢", honeypot: "🍯",
};

function recordAction(guildId, entry) {
    const list = (store.data[guildId] ??= []);
    list.push({ ...entry, timestamp: Date.now() });
    if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
    store.save();
}

// Newest first, optionally only entries about one user
function getHistory(guildId, { targetId, limit = 25 } = {}) {
    return (store.data[guildId] || []).filter(e => !targetId || e.targetId === targetId).slice(-limit).reverse();
}

// "🔨 **ban** · <@user> · by <@mod> · reason · <t:…:R>"; channel actions show the channel instead of a user
function formatEntry(entry) {
    const target = entry.targetId ? `<@${entry.targetId}>` : entry.extra?.channelId ? `<#${entry.extra.channelId}>` : null;
    return [
        `${HISTORY_EMOJI[entry.type] ?? "•"} **${entry.type}**`,
        target,
        `by ${entry.moderatorId ? `<@${entry.moderatorId}>` : "unknown"}`,
        entry.reason ? entry.reason.slice(0, 100) : null,
        `<t:${Math.floor(entry.timestamp / 1000)}:R>`,
    ].filter(Boolean).join(" · ");
}

module.exports = { HISTORY_EMOJI, recordAction, getHistory, formatEntry };
