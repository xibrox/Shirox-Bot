const { loadJsonFile } = require("./jsonFile");

// Per-server settings (auto role, welcome, logs, honeypot, automod, ...)
const store = loadJsonFile("guild-config");

function getGuildConfig(guildId) {
    return store.data[guildId] || {};
}

function updateGuildConfig(guildId, changes) {
    const updated = { ...getGuildConfig(guildId), ...changes };
    for (const key of Object.keys(updated)) {
        if (updated[key] === null || updated[key] === undefined) delete updated[key];
    }
    store.data[guildId] = updated;
    store.save();
    return updated;
}

module.exports = { getGuildConfig, updateGuildConfig };
