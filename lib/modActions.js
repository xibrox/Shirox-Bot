const { MessageFlags } = require("discord.js");
const { checkHierarchy, softban } = require("./moderation");
const { addWarning } = require("./warnings");
const { parseDuration, formatDuration } = require("./duration");
const { createLogEmbed, sendLog, userField, suppressLogsFor } = require("./logger");
const { recordAction } = require("./modHistory");

// Every action returns { error } or { publicLine } (and channel tools { notice }); callers decide where those go.

const MAX_TIMEOUT = 28 * 86_400_000;
const NOT_IN_SERVER = { error: "❌ That user is not in this server." };
const DELETE_WINDOWS = { "": 0, "0": 0, "1h": 3600, "24h": 86_400, "7d": 604_800 };

// Ban form's "delete messages from the last" field -> seconds, or null if it isn't one of the choices
const parseDeleteWindow = text => DELETE_WINDOWS[text.trim().toLowerCase()] ?? null;

// Slash commands: errors privately, results publicly (mentions never ping)
function replyResult(interaction, result) {
    if (result.error) return interaction.reply({ content: result.error, flags: MessageFlags.Ephemeral });
    return interaction.reply({ content: result.publicLine ?? result.notice, allowedMentions: { parse: [] } });
}

async function warnUser(interaction, user, reason) {
    if (user.bot) return { error: "❌ You can't warn bots." };
    if (user.id === interaction.user.id) return { error: "❌ You can't warn yourself." };
    const { guild } = interaction;

    const warnings = addWarning(guild.id, user.id, reason, interaction.user.id);
    const dmSent = await user.send(`⚠️ You were warned in **${guild.name}**. Reason: ${reason}`).then(() => true, () => false);
    recordAction(guild.id, { type: "warn", targetId: user.id, moderatorId: interaction.user.id, reason });
    const embed = createLogEmbed("warning", "⚠️ Member warned")
        .addFields(
            { name: "User", value: userField(user) },
            { name: "Moderator", value: userField(interaction.user) },
            { name: "Reason", value: reason },
            { name: "Total warnings", value: `${warnings.length}`, inline: true },
        );
    await sendLog(guild, "moderation", embed);

    return {
        publicLine: `⚠️ Warned **${user.tag}** (warning #${warnings.at(-1).id}, ${warnings.length} total). Reason: ${reason}` +
            (dmSent ? "" : "\n*(Couldn't DM them.)*"),
    };
}

async function timeoutMember(interaction, member, durationText, reason) {
    if (!member) return NOT_IN_SERVER;
    const error = checkHierarchy(interaction, member);
    if (error) return { error };
    if (!member.moderatable) return { error: "❌ I can't timeout that member." };

    const auditReason = `${interaction.user.tag}: ${reason}`;
    if (["off", "remove", "none", "0"].includes(durationText.trim().toLowerCase())) {
        await member.timeout(null, auditReason);
        return { publicLine: `🔊 Removed timeout from **${member.user.tag}**.` };
    }
    const ms = parseDuration(durationText);
    if (!ms) return { error: "⏰ Invalid duration. Examples: `10m`, `1h`, `2d`." };
    if (ms > MAX_TIMEOUT) return { error: "⚠️ The maximum timeout is 28 days." };
    await member.timeout(ms, auditReason);
    return { publicLine: `🔇 Timed out **${member.user.tag}** for **${formatDuration(ms)}**. Reason: ${reason}` };
}

async function kickMember(interaction, member, reason) {
    if (!member) return NOT_IN_SERVER;
    const error = checkHierarchy(interaction, member);
    if (error) return { error };
    if (!member.kickable) return { error: "❌ I can't kick that member." };

    await member.send(`👢 You were kicked from **${interaction.guild.name}**. Reason: ${reason}`).catch(() => {});
    await member.kick(`${interaction.user.tag}: ${reason}`);
    return { publicLine: `👢 Kicked **${member.user.tag}**. Reason: ${reason}` };
}

// `member` is null for users who aren't in the server (ban by ID)
async function banUser(interaction, user, member, reason, deleteMessageSeconds = 0) {
    if (member) {
        const error = checkHierarchy(interaction, member);
        if (error) return { error };
        if (!member.bannable) return { error: "❌ I can't ban that member." };
        await member.send(`🔨 You were banned from **${interaction.guild.name}**. Reason: ${reason}`).catch(() => {});
    }
    try {
        await interaction.guild.members.ban(user, { reason: `${interaction.user.tag}: ${reason}`, deleteMessageSeconds });
    } catch (err) {
        console.error("❌ Ban failed:", err);
        return { error: "❌ Failed to ban that user. Do I have **Ban Members**?" };
    }
    return { publicLine: `🔨 Banned **${user.tag}**. Reason: ${reason}` };
}

async function softbanMember(interaction, member, reason, deleteMessageSeconds = 86_400) {
    if (!member) return NOT_IN_SERVER;
    const error = checkHierarchy(interaction, member);
    if (error) return { error };
    if (!member.bannable) return { error: "❌ I can't ban that member." };
    const { guild } = interaction;

    await member.send(
        `🧹 You were soft banned from **${guild.name}** (removed and recent messages deleted). You can rejoin. Reason: ${reason}`,
    ).catch(() => {});
    try {
        // The ban/unban events skip suppressed users, so this shows up once as a softban
        suppressLogsFor(member.id);
        await softban(guild, member.id, `${interaction.user.tag}: ${reason}`, deleteMessageSeconds);
    } catch (err) {
        console.error("❌ Soft ban failed:", err);
        return { error: "❌ Soft ban failed. Do I have **Ban Members**?" };
    }

    recordAction(guild.id, { type: "softban", targetId: member.id, moderatorId: interaction.user.id, reason });
    const embed = createLogEmbed("danger", "🧹 Member soft banned")
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
            { name: "User", value: userField(member.user) },
            { name: "Moderator", value: userField(interaction.user) },
            { name: "Reason", value: reason },
        );
    await sendLog(guild, "moderation", embed);
    return { publicLine: `🧹 Soft banned **${member.user.tag}**. Reason: ${reason}` };
}

async function unbanUser(interaction, userId, reason) {
    if (!/^\d{17,20}$/.test(userId)) return { error: "❌ That is not a valid user ID." };
    try {
        const user = await interaction.guild.members.unban(userId, `${interaction.user.tag}: ${reason}`);
        return { publicLine: `✅ Unbanned **${user?.tag ?? userId}**.` };
    } catch {
        return { error: "❌ Couldn't unban that user. They may not be banned." };
    }
}

module.exports = {
    replyResult, parseDeleteWindow, warnUser, timeoutMember, kickMember, banUser, softbanMember, unbanUser,
};
