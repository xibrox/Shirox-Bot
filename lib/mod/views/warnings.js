const { PermissionFlagsBits: P } = require("discord.js");

// Filled in by a later task; registered now so its permissions are enforced from the start
module.exports = { view: { id: "warnings", actions: { show: P.ModerateMembers, remove: P.ModerateMembers, clear: P.ModerateMembers, confirmclear: P.ModerateMembers, cancel: P.ModerateMembers }, async handleComponent() {} } };
