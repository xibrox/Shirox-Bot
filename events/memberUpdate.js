const { Events } = require("discord.js");
const { AuditLogEvent, createLogEmbed, sendLog, findAuditEntry, userField } = require("../lib/logger");

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember) {
        if (oldMember.partial) return;
        const guild = newMember.guild;

        if (oldMember.nickname !== newMember.nickname) {
            const embed = createLogEmbed("member", "✏️ Nickname changed")
                .addFields(
                    { name: "User", value: userField(newMember.user) },
                    { name: "Before", value: oldMember.nickname || "*none*", inline: true },
                    { name: "After", value: newMember.nickname || "*none*", inline: true },
                );
            await sendLog(guild, embed);
        }

        const added = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
        const removed = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
        if (added.size || removed.size) {
            const embed = createLogEmbed("member", "🎭 Roles updated").addFields({ name: "User", value: userField(newMember.user) });
            if (added.size) embed.addFields({ name: "Added", value: added.map(r => `${r}`).join(" ") });
            if (removed.size) embed.addFields({ name: "Removed", value: removed.map(r => `${r}`).join(" ") });
            await sendLog(guild, embed);
        }

        const oldTimeout = oldMember.communicationDisabledUntilTimestamp;
        const newTimeout = newMember.communicationDisabledUntilTimestamp;
        if (oldTimeout !== newTimeout) {
            const isTimedOut = newTimeout && newTimeout > Date.now();
            const entry = await findAuditEntry(guild, AuditLogEvent.MemberUpdate, newMember.id);
            const embed = createLogEmbed(isTimedOut ? "moderation" : "member", isTimedOut ? "🔇 Member timed out" : "🔊 Timeout removed")
                .addFields({ name: "User", value: userField(newMember.user) });
            if (isTimedOut) embed.addFields({ name: "Until", value: `<t:${Math.floor(newTimeout / 1000)}:F>` });
            if (entry) embed.addFields({ name: "Moderator", value: userField(entry.executor) });
            if (isTimedOut && entry?.reason) embed.addFields({ name: "Reason", value: entry.reason });
            await sendLog(guild, embed);
        }
    },
};
