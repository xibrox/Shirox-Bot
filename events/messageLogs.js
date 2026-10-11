const { Events, AttachmentBuilder } = require("discord.js");
const { getGuildConfig } = require("../lib/guildConfig");
const { createLogEmbed, sendLog, truncate, userField, isSuppressed } = require("../lib/logger");

function isLogChannel(channel) {
    return channel.id === getGuildConfig(channel.guild.id).logChannelId;
}

module.exports = [
    {
        name: Events.MessageDelete,
        async execute(message) {
            if (!message.inGuild() || isLogChannel(message.channel) || isSuppressed(message.id)) return;
            if (message.author?.bot) return;

            const embed = createLogEmbed("message", "🗑️ Message deleted").addFields({ name: "Channel", value: `${message.channel}`, inline: true });
            if (message.partial) {
                embed.setDescription("*The message was sent before I started, so its content wasn't cached.*");
            } else {
                embed.addFields(
                    { name: "Author", value: userField(message.author) },
                    { name: "Content", value: truncate(message.content) },
                );
                if (message.attachments.size) {
                    embed.addFields({ name: "Attachments", value: message.attachments.map(a => a.name).join(", ").slice(0, 1024) });
                }
            }
            await sendLog(message.guild, embed);
        },
    },
    {
        name: Events.MessageBulkDelete,
        async execute(messages, channel) {
            if (!channel.guild || isLogChannel(channel)) return;
            const visible = messages.filter(m => !isSuppressed(m.id));
            if (!visible.size) return;

            // Attach a transcript of everything that was cached
            const transcript = [...visible.values()]
                .filter(m => !m.partial)
                .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
                .map(m => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content}${m.attachments.size ? ` [${m.attachments.size} attachment(s)]` : ""}`)
                .join("\n");

            const embed = createLogEmbed("message", "🧹 Messages bulk deleted")
                .addFields(
                    { name: "Channel", value: `${channel}`, inline: true },
                    { name: "Count", value: `${visible.size}`, inline: true },
                );

            const logChannelId = getGuildConfig(channel.guild.id).logChannelId;
            const logChannel = logChannelId && channel.guild.channels.cache.get(logChannelId);
            if (!logChannel) return;
            const files = transcript
                ? [new AttachmentBuilder(Buffer.from(transcript, "utf-8"), { name: `deleted-${channel.name}.txt` })]
                : [];
            await logChannel.send({ embeds: [embed], files }).catch(err => console.error("Failed to send bulk delete log:", err.message));
        },
    },
    {
        name: Events.MessageUpdate,
        async execute(oldMessage, newMessage) {
            if (!newMessage.inGuild() || oldMessage.partial || isLogChannel(newMessage.channel)) return;
            if (newMessage.author?.bot || oldMessage.content === newMessage.content) return;

            const embed = createLogEmbed("message", "✏️ Message edited")
                .setURL(newMessage.url)
                .addFields(
                    { name: "Author", value: userField(newMessage.author) },
                    { name: "Channel", value: `${newMessage.channel} · [Jump to message](${newMessage.url})` },
                    { name: "Before", value: truncate(oldMessage.content) },
                    { name: "After", value: truncate(newMessage.content) },
                );
            await sendLog(newMessage.guild, embed);
        },
    },
];
