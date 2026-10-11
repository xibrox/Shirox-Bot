const { Events } = require("discord.js");
const { getGuildConfig } = require("../lib/guildConfig");
const { sendGreeting } = require("../lib/greetings");
const { AuditLogEvent, createLogEmbed, sendLog, findAuditEntry, userField, isSuppressed } = require("../lib/logger");

module.exports = {
    name: Events.GuildMemberRemove,
    async execute(member) {
        if (isSuppressed(member.id)) return;

        // Bans fire their own log; a leave right after a ban would just be noise
        const ban = await findAuditEntry(member.guild, AuditLogEvent.MemberBanAdd, member.id);
        if (ban) return;

        const config = getGuildConfig(member.guild.id);
        if (config.goodbyeChannelId) {
            const template = config.goodbyeMessage || "**{username}** has left **{server}**. We now have {count} members. 👋";
            await sendGreeting(member, config.goodbyeChannelId, template, false);
        }

        const kick = await findAuditEntry(member.guild, AuditLogEvent.MemberKick, member.id);
        const embed = kick
            ? createLogEmbed("moderation", "👢 Member kicked").addFields(
                { name: "User", value: userField(member.user) },
                { name: "Moderator", value: userField(kick.executor) },
                { name: "Reason", value: kick.reason || "No reason provided" },
            )
            : createLogEmbed("leave", "📤 Member left").addFields({ name: "User", value: userField(member.user) });

        embed.setThumbnail(member.user.displayAvatarURL());
        if (member.joinedTimestamp) {
            embed.addFields({ name: "Joined", value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true });
        }
        const roles = member.roles?.cache.filter(r => r.id !== member.guild.id).map(r => `${r}`) || [];
        if (roles.length) embed.addFields({ name: "Roles", value: roles.join(" ").slice(0, 1024) });

        await sendLog(member.guild, embed);
    },
};
