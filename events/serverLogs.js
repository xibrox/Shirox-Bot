const { Events, ChannelType } = require("discord.js");
const { createLogEmbed, sendLog, userField } = require("../lib/logger");

module.exports = [
    {
        name: Events.VoiceStateUpdate,
        async execute(oldState, newState) {
            if (oldState.channelId === newState.channelId) return;
            const member = newState.member || oldState.member;
            if (!member || member.user.bot) return;

            let embed;
            if (!oldState.channelId) {
                embed = createLogEmbed("default", "🔊 Joined voice").addFields({ name: "Channel", value: `${newState.channel}` });
            } else if (!newState.channelId) {
                embed = createLogEmbed("default", "🔇 Left voice").addFields({ name: "Channel", value: `${oldState.channel}` });
            } else {
                embed = createLogEmbed("default", "🔀 Switched voice").addFields(
                    { name: "From", value: `${oldState.channel}`, inline: true },
                    { name: "To", value: `${newState.channel}`, inline: true },
                );
            }
            embed.addFields({ name: "User", value: userField(member.user) });
            await sendLog(newState.guild, "voice", embed);
        },
    },
    {
        name: Events.ChannelCreate,
        async execute(channel) {
            if (!channel.guild) return;
            const embed = createLogEmbed("success", "📁 Channel created")
                .addFields({ name: "Channel", value: `${channel} (\`${channel.name}\`, ${ChannelType[channel.type]})` });
            await sendLog(channel.guild, "server", embed);
        },
    },
    {
        name: Events.ChannelDelete,
        async execute(channel) {
            if (!channel.guild) return;
            const embed = createLogEmbed("danger", "🗑️ Channel deleted")
                .addFields({ name: "Channel", value: `\`#${channel.name}\` (${ChannelType[channel.type]})` });
            await sendLog(channel.guild, "server", embed);
        },
    },
    {
        name: Events.GuildRoleCreate,
        async execute(role) {
            const embed = createLogEmbed("success", "🎭 Role created").addFields({ name: "Role", value: `${role} (\`${role.name}\`)` });
            await sendLog(role.guild, "server", embed);
        },
    },
    {
        name: Events.GuildRoleDelete,
        async execute(role) {
            const embed = createLogEmbed("danger", "🗑️ Role deleted").addFields({ name: "Role", value: `\`${role.name}\`` });
            await sendLog(role.guild, "server", embed);
        },
    },
];
