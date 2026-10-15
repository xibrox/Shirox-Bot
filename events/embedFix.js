const { Events, PermissionFlagsBits } = require("discord.js");
const { getGuildConfig } = require("../lib/guildConfig");
const { fixLinks } = require("../lib/embedFix");

// Replies to social media posts with links that embed properly (set up in /setup → Link embeds)
module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (!message.inGuild() || message.author.bot) return;
        const config = getGuildConfig(message.guild.id);
        if (!config.embedFix || message.channelId === config.honeypotChannelId) return;

        const links = fixLinks(message.content, config.embedFixServices);
        if (!links.length) return;
        await message.reply({ content: links.join("\n"), allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});

        // Hiding the original embed needs Manage Messages in that channel
        if (config.embedFixHide && message.channel.permissionsFor(message.guild.members.me)?.has(PermissionFlagsBits.ManageMessages)) {
            await message.suppressEmbeds(true).catch(() => {});
        }
    },
};
