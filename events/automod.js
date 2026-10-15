const { Events, PermissionFlagsBits } = require("discord.js");
const { getGuildConfig } = require("../lib/guildConfig");
const { createLogEmbed, sendLog, truncate, userField, suppressLogsFor } = require("../lib/logger");

const INVITE_REGEX = /(?:discord\.gg|discord(?:app)?\.com\/invite)\/([\w-]+)/i;
const LINK_REGEX = /https?:\/\/\S+/i;

const SPAM_COUNT = 5;
const SPAM_WINDOW_MS = 5_000;
const SPAM_TIMEOUT_MS = 5 * 60_000;
const MENTION_TIMEOUT_MS = 10 * 60_000;

// `${guildId}:${userId}` -> recent messages, for spam detection
const recentMessages = new Map();
setInterval(() => {
    const cutoff = Date.now() - SPAM_WINDOW_MS;
    for (const [key, messages] of recentMessages) {
        if (messages.at(-1).createdTimestamp < cutoff) recentMessages.delete(key);
    }
}, 60_000).unref();

// An invite to another server that isn't on this server's allowlist
async function isForeignInvite(message, config) {
    const code = message.content.match(INVITE_REGEX)?.[1];
    if (!code) return false;
    const invite = await message.client.fetchInvite(code).catch(() => null);
    const target = invite?.guild?.id;
    if (target === message.guild.id) return false;
    return !(config.automodInviteAllow ?? []).some(server => server.id === target);
}

async function punish(message, rule, { timeoutMs, messages = [message] } = {}) {
    for (const m of messages) suppressLogsFor(m.id);
    if (messages.length > 1) {
        await message.channel.bulkDelete(messages, true).catch(() => {});
    } else {
        await message.delete().catch(() => {});
    }

    let timedOut = false;
    if (timeoutMs && message.member?.moderatable) {
        timedOut = await message.member.timeout(timeoutMs, `Automod: ${rule}`).then(() => true, () => false);
    }

    const notice = await message.channel.send(
        `🛡️ ${message.author}, your message was removed: **${rule}**${timedOut ? ` (timed out for ${timeoutMs / 60_000}m)` : ""}.`,
    ).catch(() => null);
    if (notice) setTimeout(() => notice.delete().catch(() => {}), 6_000);

    const embed = createLogEmbed("danger", "🛡️ Automod")
        .addFields(
            { name: "User", value: userField(message.author) },
            { name: "Rule", value: rule, inline: true },
            { name: "Channel", value: `${message.channel}`, inline: true },
            { name: "Message ID", value: `\`${message.id}\``, inline: true },
            { name: "Message", value: truncate(message.content) },
        );
    if (timedOut) embed.addFields({ name: "Action", value: `Timed out for ${timeoutMs / 60_000}m` });
    await sendLog(message.guild, "moderation", embed);
}

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (!message.inGuild() || message.author.bot || !message.member) return;
        const config = getGuildConfig(message.guild.id);
        if (message.channelId === config.honeypotChannelId) return;
        if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

        if (config.automodMentionLimit) {
            const mentions = message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 1 : 0);
            if (mentions > config.automodMentionLimit) {
                return punish(message, `Too many mentions (${mentions})`, { timeoutMs: MENTION_TIMEOUT_MS });
            }
        }

        if (config.automodInvites && await isForeignInvite(message, config)) {
            return punish(message, "Invite links are not allowed");
        }

        if (config.automodLinks && LINK_REGEX.test(message.content)) {
            return punish(message, "Links are not allowed");
        }

        if (config.automodSpam) {
            const key = `${message.guild.id}:${message.author.id}`;
            const cutoff = Date.now() - SPAM_WINDOW_MS;
            const messages = (recentMessages.get(key) || []).filter(m => m.createdTimestamp > cutoff);
            messages.push(message);
            recentMessages.set(key, messages);

            if (messages.length >= SPAM_COUNT) {
                recentMessages.delete(key);
                const inChannel = messages.filter(m => m.channelId === message.channelId);
                return punish(message, "Spamming", { timeoutMs: SPAM_TIMEOUT_MS, messages: inChannel });
            }
        }
    },
};
