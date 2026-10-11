const { Events, EmbedBuilder } = require("discord.js");
const { getGuildConfig } = require("../lib/guildConfig");
const { createLogEmbed, sendLog, userField, suppressLogsFor } = require("../lib/logger");

const DAY_MS = 86_400_000;

async function kickIfTooNew(member, config) {
    const minDays = config.automodMinAccountAgeDays;
    if (!minDays || member.user.bot) return false;
    if (Date.now() - member.user.createdTimestamp >= minDays * DAY_MS) return false;
    if (!member.kickable) return false;

    await member.send(
        `👋 You were removed from **${member.guild.name}** because your account is younger than ${minDays} day(s). Feel free to come back later!`,
    ).catch(() => {});
    suppressLogsFor(member.id);
    await member.kick(`Automod: account younger than ${minDays} day(s)`).catch(() => {});

    const embed = createLogEmbed("moderation", "🆕 New account kicked")
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
            { name: "User", value: userField(member.user) },
            { name: "Account created", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` },
        );
    await sendLog(member.guild, embed);
    return true;
}

async function giveAutoRole(member, config) {
    const roleId = member.user.bot ? config.botAutoRoleId : config.autoRoleId;
    if (!roleId) return;
    const role = member.guild.roles.cache.get(roleId);
    if (!role) {
        console.warn(`Auto role ${roleId} no longer exists in ${member.guild.name}`);
        return;
    }
    await member.roles.add(role, "Auto role on join").catch(err =>
        console.error(`Failed to add auto role in ${member.guild.name}:`, err.message));
}

async function sendWelcome(member, config) {
    if (!config.welcomeChannelId) return;
    const channel = member.guild.channels.cache.get(config.welcomeChannelId);
    if (!channel?.isTextBased()) return;

    const text = (config.welcomeMessage || "Welcome to **{server}**, {user}! 🎉")
        .replaceAll("{user}", `${member}`)
        .replaceAll("{username}", member.user.username)
        .replaceAll("{server}", member.guild.name)
        .replaceAll("{count}", `${member.guild.memberCount}`);
    const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setDescription(text)
        .setThumbnail(member.user.displayAvatarURL());
    await channel.send({ content: `${member}`, embeds: [embed] }).catch(err =>
        console.error(`Failed to send welcome message in ${member.guild.name}:`, err.message));
}

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        const config = getGuildConfig(member.guild.id);
        if (await kickIfTooNew(member, config)) return;

        await giveAutoRole(member, config);
        await sendWelcome(member, config);

        const ageDays = (Date.now() - member.user.createdTimestamp) / DAY_MS;
        const embed = createLogEmbed("member", "📥 Member joined")
            .setThumbnail(member.user.displayAvatarURL())
            .addFields(
                { name: "User", value: userField(member.user) },
                {
                    name: "Account created",
                    value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>${ageDays < 7 ? " ⚠️ **new account**" : ""}`,
                    inline: true,
                },
                { name: "Member count", value: `${member.guild.memberCount}`, inline: true },
            );
        await sendLog(member.guild, embed);
    },
};
