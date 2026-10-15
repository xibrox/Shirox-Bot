const { Events } = require("discord.js");
const { getGuildConfig } = require("../lib/guildConfig");
const { isActive } = require("../lib/features");
const { DEFAULT_GOODBYE, sendGreeting } = require("../lib/greetings");
const { saveMemberRoles } = require("../lib/savedRoles");
const { AuditLogEvent, createLogEmbed, sendLog, findAuditEntry, userField, isSuppressed } = require("../lib/logger");

module.exports = {
    name: Events.GuildMemberRemove,
    async execute(member) {
        if (isSuppressed(member.id)) return;

        // Bans fire their own log; a leave right after a ban would just be noise
        const ban = await findAuditEntry(member.guild, AuditLogEvent.MemberBanAdd, member.id);
        if (ban) return;

        const config = getGuildConfig(member.guild.id);
        const saved = config.restoreRoles && !member.partial ? saveMemberRoles(member) : null;
        if (isActive(config, "goodbye")) {
            const template = config.goodbyeMessage || DEFAULT_GOODBYE;
            await sendGreeting(member, config.goodbyeChannelId, template, false);
        }

        const kick = await findAuditEntry(member.guild, AuditLogEvent.MemberKick, member.id);
        const embed = kick
            ? createLogEmbed("danger", "👢 Member kicked").addFields(
                { name: "User", value: userField(member.user) },
                { name: "Moderator", value: userField(kick.executor) },
                { name: "Reason", value: kick.reason || "No reason provided" },
            )
            : createLogEmbed("danger", "📤 Member left").addFields({ name: "User", value: userField(member.user) });

        embed.setThumbnail(member.user.displayAvatarURL());
        if (member.joinedTimestamp) {
            embed.addFields({ name: "Joined", value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true });
        }
        const roles = member.roles?.cache.filter(r => r.id !== member.guild.id).map(r => `${r}`) || [];
        if (roles.length) embed.addFields({ name: "Roles", value: roles.join(" ").slice(0, 1024) });
        if (saved) {
            const lines = [];
            if (saved.roles.length) lines.push(saved.roles.map(id => `<@&${id}>`).join(" "));
            if (saved.nickname) lines.push(`Nickname: \`${saved.nickname}\``);
            embed.addFields({ name: "♻️ Saved for restore", value: lines.join("\n").slice(0, 1024) });
        }

        await sendLog(member.guild, kick ? "moderation" : "members", embed);
    },
};
