const { Events } = require("discord.js");
const { getGuildConfig } = require("../lib/guildConfig");
const { isActive } = require("../lib/features");
const { recordAction } = require("../lib/modHistory");
const { DEFAULT_WELCOME, sendGreeting } = require("../lib/greetings");
const { restoreMemberRoles } = require("../lib/savedRoles");
const { createLogEmbed, sendLog, userField, suppressLogsFor } = require("../lib/logger");

const DAY_MS = 86_400_000;

async function kickIfTooNew(member, config) {
    const minDays = config.automodMinAccountAgeDays;
    if (!minDays || member.user.bot) return false;
    // People an admin put on the join whitelist were approved on purpose
    if (config.joinWhitelist && (config.joinWhitelistIds ?? []).includes(member.id)) return false;
    if (Date.now() - member.user.createdTimestamp >= minDays * DAY_MS) return false;
    if (!member.kickable) return false;

    await member.send(
        `👋 You were removed from **${member.guild.name}** because your account is younger than ${minDays} day(s). Feel free to come back later!`,
    ).catch(() => {});
    suppressLogsFor(member.id);
    await member.kick(`Automod: account younger than ${minDays} day(s)`).catch(() => {});

    const embed = createLogEmbed("danger", "🆕 New account kicked")
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
            { name: "User", value: userField(member.user) },
            { name: "Account created", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` },
        );
    await sendLog(member.guild, "moderation", embed);
    return true;
}

// With the join whitelist on, only listed people may join (bots are added by admins, so they pass)
async function kickIfNotWhitelisted(member, config) {
    if (!config.joinWhitelist || member.user.bot) return false;
    if ((config.joinWhitelistIds ?? []).includes(member.id)) return false;

    let kicked = false;
    if (member.kickable) {
        await member.send(
            `🔐 **${member.guild.name}** only lets in approved members. Ask a moderator to add you, then join again.`,
        ).catch(() => {});
        suppressLogsFor(member.id);
        kicked = await member.kick("Join whitelist: not on the list").then(() => true, () => false);
    }
    if (!kicked) {
        // Let them in, but make sure staff notice the whitelist isn't working
        const warning = createLogEmbed("warning", "⚠️ Join whitelist couldn't kick someone")
            .addFields(
                { name: "User", value: userField(member.user) },
                { name: "Fix", value: "Give me **Kick Members** and move my role above theirs." },
            );
        await sendLog(member.guild, "moderation", warning);
        return false;
    }
    recordAction(member.guild.id, { type: "kick", targetId: member.id, moderatorId: member.client?.user.id ?? null, reason: "Not on the join whitelist" });

    const embed = createLogEmbed("danger", "🔐 Not on the join whitelist")
        .setThumbnail(member.user.displayAvatarURL())
        .addFields({ name: "User", value: userField(member.user) }, { name: "Action", value: "Kicked" });
    await sendLog(member.guild, "moderation", embed);
    return true;
}

async function restoreRoles(member, config) {
    if (!config.restoreRoles) return;
    const result = await restoreMemberRoles(member).catch(err => {
        console.error(`Failed to restore roles in ${member.guild.name}:`, err.message);
        return null;
    });
    if (!result || (!result.restored.length && !result.nickname)) return;

    const embed = createLogEmbed("success", "♻️ Roles restored").addFields({ name: "User", value: userField(member.user) });
    if (result.restored.length) embed.addFields({ name: "Roles", value: result.restored.map(r => `${r}`).join(" ").slice(0, 1024) });
    if (result.nickname) embed.addFields({ name: "Nickname", value: result.nickname });
    await sendLog(member.guild, "members", embed);
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
    if (!isActive(config, "welcome")) return;
    const template = config.welcomeMessage || DEFAULT_WELCOME;
    await sendGreeting(member, config.welcomeChannelId, template, true, config.welcomeTitle);
}

module.exports = {
    sendWelcome,
    name: Events.GuildMemberAdd,
    async execute(member) {
        const config = getGuildConfig(member.guild.id);
        if (await kickIfNotWhitelisted(member, config)) return;
        if (await kickIfTooNew(member, config)) return;

        await restoreRoles(member, config);
        await giveAutoRole(member, config);
        await sendWelcome(member, config);

        const ageDays = (Date.now() - member.user.createdTimestamp) / DAY_MS;
        const embed = createLogEmbed("success", "📥 Member joined")
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
        await sendLog(member.guild, "members", embed);
    },
};
