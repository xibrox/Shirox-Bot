const { PermissionFlagsBits } = require("discord.js");
const { permissionNames, listText } = require("./permissions");

// What the bot needs to post embeds in a channel (welcome, goodbye, logs, FAQ panels)
const SEND_EMBED_PERMISSIONS = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];

// Returns an error message if `member` (usually the bot) lacks any of `perms` in `channel`, otherwise null
function missingChannelPermissions(channel, member, perms) {
    if (channel.permissionsFor(member)?.has(perms)) return null;
    return `❌ I need ${listText(permissionNames(perms))} in ${channel}.`;
}

module.exports = { missingChannelPermissions, SEND_EMBED_PERMISSIONS };
