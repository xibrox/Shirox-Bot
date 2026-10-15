const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { COLORS } = require("./colors");
const { missingChannelPermissions } = require("./channelChecks");

const ACTION_LABELS = {
    softban: "Soft ban (ban + instant unban, deletes their last 24h of messages)",
    ban: "Ban (deletes their last 24h of messages)",
    kick: "Kick",
};

const ACTION_RESULTS = {
    softban: "removed from the server and has their recent messages deleted",
    ban: "banned",
    kick: "kicked",
};

// Returns an error message if the honeypot can't work in `channel` with `action`, otherwise null
function honeypotError(guild, channel, action) {
    const me = guild.members.me;
    const kick = action === "kick";
    if (!me.permissions.has(kick ? PermissionFlagsBits.KickMembers : PermissionFlagsBits.BanMembers)) {
        return `❌ I need the **${kick ? "Kick" : "Ban"} Members** permission for this.`;
    }
    return missingChannelPermissions(channel, me, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageMessages]);
}

const DEFAULT_WARNING_TITLE = "⚠️ DO NOT SEND MESSAGES IN THIS CHANNEL";
const DEFAULT_WARNING_TEXT = "This channel is a trap for hacked accounts and spam bots.\n\nAnyone who posts here is **automatically {action}**.";

// The "do not type here" notice posted in the trap channel; {action} becomes what happens to posters
function honeypotWarningEmbed(action, { title, text } = {}) {
    return new EmbedBuilder()
        .setColor(COLORS.danger)
        .setTitle(title || DEFAULT_WARNING_TITLE)
        .setDescription((text || DEFAULT_WARNING_TEXT).replaceAll("{action}", ACTION_RESULTS[action] ?? ACTION_RESULTS.softban));
}

// The warning with this server's saved title and text
const savedWarning = (config, action) =>
    honeypotWarningEmbed(action, { title: config.honeypotWarningTitle, text: config.honeypotWarningText });

module.exports = { ACTION_LABELS, DEFAULT_WARNING_TITLE, honeypotError, honeypotWarningEmbed, savedWarning };
