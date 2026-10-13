const { EmbedBuilder } = require("discord.js");
const { EMBED_COLOR } = require("./colors");

const DEFAULT_WELCOME = "Welcome to **{server}**, {user}! 🎉";
const DEFAULT_GOODBYE = "**{username}** has left **{server}**. We now have {count} members. 👋";

const PLACEHOLDERS = "`{user}` mention, `{username}` name, `{server}` server name, `{count}` member count";

function fillTemplate(template, member) {
    return template
        .replaceAll("{user}", `${member}`)
        .replaceAll("{username}", member.user.username)
        .replaceAll("{server}", member.guild.name)
        .replaceAll("{count}", `${member.guild.memberCount}`);
}

const timestamp = ms => `<t:${Math.floor(ms / 1000)}:R>`;

function buildGreetingEmbed(member, template, joining) {
    const { guild, user } = member;
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
        .setTitle(joining ? `👋 Welcome to ${guild.name}!` : "👋 Goodbye!")
        .setDescription(fillTemplate(template, member))
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .setFooter({ text: guild.name, iconURL: guild.iconURL() ?? undefined })
        .setTimestamp();

    if (joining) {
        embed.addFields(
            { name: "Member", value: `#${guild.memberCount}`, inline: true },
            { name: "Account created", value: timestamp(user.createdTimestamp), inline: true },
        );
    } else {
        embed.addFields({ name: "Members now", value: `${guild.memberCount}`, inline: true });
        if (member.joinedTimestamp) {
            embed.addFields({ name: "Joined", value: timestamp(member.joinedTimestamp), inline: true });
        }
    }
    return embed;
}

// Sends the welcome (joining = true) or goodbye embed for `member` to `channelId`
async function sendGreeting(member, channelId, template, joining) {
    const channel = member.guild.channels.cache.get(channelId);
    if (!channel?.isTextBased()) return;

    const embed = buildGreetingEmbed(member, template, joining);
    // Ping new members so they notice the welcome; never ping someone who left
    await channel.send({ content: joining ? `${member}` : undefined, embeds: [embed] }).catch(err =>
        console.error(`Failed to send greeting in ${member.guild.name}:`, err.message));
}

module.exports = { DEFAULT_WELCOME, DEFAULT_GOODBYE, PLACEHOLDERS, fillTemplate, buildGreetingEmbed, sendGreeting };
