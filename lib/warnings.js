const { loadJsonFile } = require("./jsonFile");

// { [guildId]: { [userId]: [{ id, reason, moderatorId, timestamp }] } }
const store = loadJsonFile("warnings");

function getWarnings(guildId, userId) {
    return store.data[guildId]?.[userId] || [];
}

function addWarning(guildId, userId, reason, moderatorId) {
    store.data[guildId] ??= {};
    const list = (store.data[guildId][userId] ??= []);
    const id = (list.at(-1)?.id ?? 0) + 1;
    list.push({ id, reason, moderatorId, timestamp: Date.now() });
    store.save();
    return list;
}

function removeWarning(guildId, userId, id) {
    const list = getWarnings(guildId, userId);
    const index = list.findIndex(w => w.id === id);
    if (index === -1) return false;
    list.splice(index, 1);
    store.save();
    return true;
}

function clearWarnings(guildId, userId) {
    const count = getWarnings(guildId, userId).length;
    if (store.data[guildId]) delete store.data[guildId][userId];
    store.save();
    return count;
}

module.exports = { getWarnings, addWarning, removeWarning, clearWarnings };
