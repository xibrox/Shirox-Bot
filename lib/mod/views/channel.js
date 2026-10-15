const { PermissionFlagsBits: P } = require("discord.js");

// Filled in by a later task; registered now so its permissions are enforced from the start
module.exports = { view: { id: "channel", actions: { show: null, pick: null, purge: P.ManageMessages, lock: P.ManageChannels, unlock: P.ManageChannels, slowmode: P.ManageChannels }, async handleComponent() {} } };
