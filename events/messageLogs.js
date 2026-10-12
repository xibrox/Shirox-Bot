const { Events, AttachmentBuilder } = require("discord.js");
const { getGuildConfig } = require("../lib/guildConfig");
const { createLogEmbed, sendLog, truncate, userField, isSuppressed } = require("../lib/logger");
const { cacheMessageImages, takeDeletedImages, forgetMessage } = require("../lib/attachmentCache");

function isLogChannel(channel) {
    return channel.id === getGuildConfig(channel.guild.id).logChannelId;
}

// Discord only allows simple characters in attachment:// names
function safeFileName(name, index) {
    const cleaned = name.replace(/[^\w.-]/g, "_");
    return `${index}_${cleaned}`;
}

module.exports = [
    {
        // Keep a copy of posted images so they can still be shown if the message gets deleted
        name: Events.MessageCreate,
        async execute(message) {
            if (!message.inGuild() || message.author.bot || !message.attachments.size) return;
            if (!getGuildConfig(message.guild.id).logChannelId || isLogChannel(message.channel)) return;
            await cacheMessageImages(message);
        },
    },
    {
        name: Events.MessageDelete,
        async execute(message) {
            if (!message.inGuild() || isLogChannel(message.channel) || message.author?.bot) {
                forgetMessage(message.id);
                return;
            }
            if (isSuppressed(message.id)) {
                forgetMessage(message.id);
                return;
            }

            const embed = createLogEmbed("danger", "🗑️ Message deleted").addFields(
                { name: "Channel", value: `${message.channel}`, inline: true },
                { name: "Message ID", value: `\`${message.id}\``, inline: true },
            );

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

            const images = await takeDeletedImages(message);
            const files = images.map((image, i) => new AttachmentBuilder(image.buffer, { name: safeFileName(image.name, i) }));
            if (files.length) embed.setImage(`attachment://${files[0].name}`);
            if (files.length > 1) embed.setFooter({ text: `${files.length} images attached below` });

            await sendLog(message.guild, embed, files);
        },
    },
    {
        name: Events.MessageBulkDelete,
        async execute(messages, channel) {
            for (const id of messages.keys()) forgetMessage(id);
            if (!channel.guild || isLogChannel(channel)) return;
            const visible = messages.filter(m => !isSuppressed(m.id));
            if (!visible.size) return;

            // Attach a transcript of everything that was cached
            const transcript = [...visible.values()]
                .filter(m => !m.partial)
                .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
                .map(m => `[${new Date(m.createdTimestamp).toISOString()}] (${m.id}) ${m.author.tag} (${m.author.id}): ${m.content}` +
                    (m.attachments.size ? ` [attachments: ${m.attachments.map(a => a.name).join(", ")}]` : ""))
                .join("\n");

            const embed = createLogEmbed("danger", "🧹 Messages bulk deleted")
                .addFields(
                    { name: "Channel", value: `${channel}`, inline: true },
                    { name: "Count", value: `${visible.size}`, inline: true },
                );
            const files = transcript
                ? [new AttachmentBuilder(Buffer.from(transcript, "utf-8"), { name: `deleted-${channel.name}.txt` })]
                : [];
            await sendLog(channel.guild, embed, files);
        },
    },
    {
        name: Events.MessageUpdate,
        async execute(oldMessage, newMessage) {
            if (!newMessage.inGuild() || oldMessage.partial || isLogChannel(newMessage.channel)) return;
            if (newMessage.author?.bot || oldMessage.content === newMessage.content) return;

            const embed = createLogEmbed("update", "✏️ Message edited")
                .setURL(newMessage.url)
                .addFields(
                    { name: "Author", value: userField(newMessage.author) },
                    { name: "Channel", value: `${newMessage.channel} · [Jump to message](${newMessage.url})`, inline: true },
                    { name: "Message ID", value: `\`${newMessage.id}\``, inline: true },
                    { name: "Before", value: truncate(oldMessage.content) },
                    { name: "After", value: truncate(newMessage.content) },
                );
            await sendLog(newMessage.guild, embed);
        },
    },
];
