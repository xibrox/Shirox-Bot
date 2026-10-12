const { Events, EmbedBuilder } = require("discord.js");
const { COLORS } = require("../lib/colors");
const { recordJoin, getJoinInfo, forgetGuild } = require("../lib/botGuilds");
const { dmOwners } = require("../lib/owner");

module.exports = [
    {
        // Fill in who added the bot for servers it joined while offline or before tracking existed
        name: Events.ClientReady,
        once: true,
        async execute(client) {
            for (const guild of client.guilds.cache.values()) {
                if (!getJoinInfo(guild.id)) await recordJoin(guild);
            }
        },
    },
    {
        name: Events.GuildCreate,
        async execute(guild) {
            const { addedBy } = await recordJoin(guild);
            const embed = new EmbedBuilder()
                .setColor(COLORS.success)
                .setTitle("➕ Added to a server")
                .setThumbnail(guild.iconURL())
                .addFields(
                    { name: "Server", value: `${guild.name}\n\`${guild.id}\``, inline: true },
                    { name: "Members", value: `${guild.memberCount}`, inline: true },
                    { name: "Added by", value: addedBy ? `<@${addedBy}> (\`${addedBy}\`)` : "Unknown (no audit log access)" },
                    { name: "Server owner", value: `<@${guild.ownerId}>` },
                )
                .setFooter({ text: `Now in ${guild.client.guilds.cache.size} servers` })
                .setTimestamp();
            await dmOwners(guild.client, { embeds: [embed] });
        },
    },
    {
        name: Events.GuildDelete,
        async execute(guild) {
            if (!guild.available) return; // Discord outage, not a real removal
            forgetGuild(guild.id);
            const embed = new EmbedBuilder()
                .setColor(COLORS.danger)
                .setTitle("➖ Removed from a server")
                .addFields({ name: "Server", value: `${guild.name}\n\`${guild.id}\`` })
                .setFooter({ text: `Now in ${guild.client.guilds.cache.size} servers` })
                .setTimestamp();
            await dmOwners(guild.client, { embeds: [embed] });
        },
    },
];
