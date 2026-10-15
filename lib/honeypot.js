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

// The "do not type here" notice posted in the trap channel
function honeypotWarningEmbed(action) {
    return new EmbedBuilder()
        .setColor(COLORS.danger)
        .setTitle("⚠️ DO NOT SEND MESSAGES IN THIS CHANNEL")
        .setDescription(
            "This channel is a trap for hacked accounts and spam bots.\n\n" +
            `Anyone who posts here is **automatically ${ACTION_RESULTS[action] ?? ACTION_RESULTS.softban}**.`,
        );
}

module.exports = { ACTION_LABELS, honeypotError, honeypotWarningEmbed };
