const { Events, PermissionFlagsBits } = require("discord.js");
const { getGuildConfig } = require("../lib/guildConfig");
const { createLogEmbed, sendLog, truncate, userField, suppressLogsFor } = require("../lib/logger");

// Hacked accounts usually spam several channels at once; only act once per user
const inProgress = new Set();

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (!message.inGuild() || message.author.bot) return;
        const config = getGuildConfig(message.guild.id);
        if (!config.honeypotChannelId || message.channelId !== config.honeypotChannelId) return;

        const member = message.member;
        if (!member || member.id === message.guild.ownerId) return;
        if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
        if (inProgress.has(member.id)) return;
        inProgress.add(member.id);

        const action = config.honeypotAction || "softban";
        const reason = "Honeypot: posted in the trap channel (likely a compromised account)";
        suppressLogsFor(message.id);
        suppressLogsFor(member.id);
        await message.delete().catch(() => {});

        const embed = createLogEmbed("moderation", "🍯 Honeypot triggered")
            .setThumbnail(message.author.displayAvatarURL())
            .addFields(
                { name: "User", value: userField(message.author) },
                { name: "Message", value: truncate(message.content || "*no text (attachment/embed)*") },
            );

        try {
            const canAct = action === "kick" ? member.kickable : member.bannable;
            if (!canAct) throw new Error("Missing permissions or the member's role is above mine");

            const rejoinNote = action === "ban" ? "" : " You can rejoin once your account is secure.";
            await message.author.send(
                `🍯 You were removed from **${message.guild.name}** because your account posted in a trap channel that only spam bots and hacked accounts use.\n\n` +
                `If this wasn't you, your account is probably compromised: **change your password, enable 2FA, and remove any unknown authorized apps/devices** in Discord settings.${rejoinNote}`,
            ).catch(() => {});

            if (action === "kick") {
                await member.kick(reason);
            } else {
                await message.guild.members.ban(member.id, { reason, deleteMessageSeconds: 86_400 });
                if (action === "softban") await message.guild.members.unban(member.id, "Honeypot soft ban");
            }

            const labels = { softban: "Soft banned (last 24h of messages deleted)", ban: "Banned (last 24h of messages deleted)", kick: "Kicked" };
            embed.addFields({ name: "Action", value: labels[action] });
        } catch (err) {
            console.error(`Honeypot action failed in ${message.guild.name}:`, err.message);
            embed.addFields({ name: "❌ Action failed", value: err.message });
        } finally {
            setTimeout(() => inProgress.delete(member.id), 30_000);
        }

        await sendLog(message.guild, embed);
    },
};
