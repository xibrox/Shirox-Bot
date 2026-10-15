const { PermissionFlagsBits: P } = require("discord.js");

// Filled in by the bans list task; registered now so its permission is enforced from the start
module.exports = { view: { id: "bans", actions: { show: P.BanMembers }, async handleComponent() {} } };
