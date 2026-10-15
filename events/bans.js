const { Events } = require("discord.js");
const { forgetMemberRoles } = require("../lib/savedRoles");
const { AuditLogEvent, createLogEmbed, sendLog, findAuditEntry, userField, isSuppressed } = require("../lib/logger");
const { recordAction } = require("../lib/modHistory");

async function logBan(ban, added) {
    // Banned members should never get their old roles back
    if (added) forgetMemberRoles(ban.guild.id, ban.user.id);
    if (isSuppressed(ban.user.id)) return;
    const entry = await findAuditEntry(ban.guild, added ? AuditLogEvent.MemberBanAdd : AuditLogEvent.MemberBanRemove, ban.user.id);
    recordAction(ban.guild.id, {
        type: added ? "ban" : "unban",
        targetId: ban.user.id,
        moderatorId: entry?.executor?.id ?? null,
        reason: entry?.reason || ban.reason || null,
    });
    const embed = createLogEmbed(added ? "danger" : "success", added ? "🔨 Member banned" : "✅ Member unbanned")
        .setThumbnail(ban.user.displayAvatarURL())
        .addFields({ name: "User", value: userField(ban.user) });
    if (entry) embed.addFields({ name: "Moderator", value: userField(entry.executor) });
    if (added) embed.addFields({ name: "Reason", value: entry?.reason || ban.reason || "No reason provided" });
    await sendLog(ban.guild, "moderation", embed);
}

module.exports = [
    { name: Events.GuildBanAdd, execute: ban => logBan(ban, true) },
    { name: Events.GuildBanRemove, execute: ban => logBan(ban, false) },
];
