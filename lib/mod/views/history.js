const { PermissionFlagsBits: P } = require("discord.js");

// Filled in by a later task; registered now so its permissions are enforced from the start
module.exports = { view: { id: "history", actions: { show: P.ModerateMembers }, async handleComponent() {} } };
