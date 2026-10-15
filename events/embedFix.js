const { Events, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { getGuildConfig } = require("../lib/guildConfig");
const { PLATFORMS, fixLinks, settingsFrom, switchService, serviceMenus } = require("../lib/embedFix");

// Replies to social media posts with links that embed properly (set up in /setup → Link embeds)
module.exports = {
    name: Events.MessageCreate,
    // Service menus under the replies use "embedfix:switch:<platform>:<posterId>"
    componentPrefix: "embedfix",

    async execute(message) {
        if (!message.inGuild() || message.author.bot) return;
        const config = getGuildConfig(message.guild.id);
        if (!config.embedFix || message.channelId === config.honeypotChannelId) return;
        // Automod deletes links from members without Manage Messages; reposting them would undo that
        if (config.automodLinks && !message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;

        const settings = settingsFrom(config);
        const links = fixLinks(message.content, settings);
        if (!links.length) return;
        const content = links.join("\n");
        const replied = await message.reply({
            content,
            components: serviceMenus(content, message.author.id, settings),
            allowedMentions: { parse: [], repliedUser: false },
        }).then(() => true, () => false);
        if (!replied) return;

        // Hiding the original embed needs Manage Messages in that channel
        if (config.embedFixHide && message.channel.permissionsFor(message.guild.members.me)?.has(PermissionFlagsBits.ManageMessages)) {
            await message.suppressEmbeds(true).catch(() => {});
        }
    },

    async handleComponent(interaction) {
        const [, action, platformId, posterId] = interaction.customId.split(":");
        const platform = PLATFORMS.find(p => p.id === platformId);
        if (action !== "switch" || !platform) return;
        if (interaction.user.id !== posterId) {
            return interaction.reply({ content: "❌ Only the person who posted the link can change its service.", flags: MessageFlags.Ephemeral });
        }
        const host = interaction.values[0];
        if (!platform.services.some(([h]) => h === host)) {
            return interaction.reply({ content: "❌ That service isn't available anymore.", flags: MessageFlags.Ephemeral });
        }
        const content = switchService(interaction.message.content, platformId, host);
        const settings = settingsFrom(interaction.guild ? getGuildConfig(interaction.guild.id) : {});
        await interaction.update({ content, components: serviceMenus(content, posterId, settings), allowedMentions: { parse: [] } });
    },
};
