const { PermissionFlagsBits: P, ButtonStyle } = require("discord.js");
const { getWarnings } = require("../../warnings");
const { getHistory, formatEntry } = require("../../modHistory");
const { button, homeButton, rowOf, modEmbed, panel, can, fetchMember } = require("../ui");
const { homeView, NO_USER } = require("./home");

const unix = ms => Math.floor(ms / 1000);
const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

async function userView(interaction, userId, notice) {
    const { guild } = interaction;
    const user = await interaction.client.users.fetch(userId).catch(() => null);
    if (!user) return homeView(interaction, NO_USER);
    const member = await fetchMember(guild, userId);
    const banned = !member && can(interaction, P.BanMembers) ? !!(await guild.bans.fetch(userId).catch(() => null)) : false;
    const timedOut = member?.communicationDisabledUntilTimestamp > Date.now();
    const warnings = getWarnings(guild.id, userId);
    const history = getHistory(guild.id, { targetId: userId, limit: 5 });

    const embed = modEmbed(`🛡️ ${user.tag}`)
        .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
        .setThumbnail(user.displayAvatarURL())
        .setDescription(`${user} · \`${user.id}\`${member ? "" : "\n*Not in this server*"}`)
        .addFields(
            { name: "Account created", value: `<t:${unix(user.createdTimestamp)}:R>`, inline: true },
            { name: "Joined", value: member?.joinedTimestamp ? `<t:${unix(member.joinedTimestamp)}:R>` : "—", inline: true },
            { name: "Top role", value: member ? `${member.roles.highest}` : "—", inline: true },
            { name: "Timeout", value: timedOut ? `until <t:${unix(member.communicationDisabledUntilTimestamp)}:R>` : "no", inline: true },
        );
    if (!member && can(interaction, P.BanMembers)) embed.addFields({ name: "Banned", value: banned ? "yes" : "no", inline: true });
    const newest = warnings.slice(-3).reverse().map(w => `#${w.id} · ${clip(w.reason, 200)} · <t:${unix(w.timestamp)}:R>`);
    embed.addFields(
        { name: "Warnings", value: clip([`${warnings.length}`, ...newest].join("\n"), 1024) },
        { name: "Recent history", value: clip(history.map(formatEntry).join("\n") || "none", 1024) },
    );

    const id = user.id;
    return panel(embed, [
        rowOf(
            can(interaction, P.ModerateMembers) && button(`mod:user:warn:${id}`, "⚠️ Warn"),
            member && can(interaction, P.ModerateMembers) && (timedOut
                ? button(`mod:user:untimeout:${id}`, "🔊 Remove timeout", ButtonStyle.Success)
                : button(`mod:user:timeout:${id}`, "⏱️ Timeout").setDisabled(!member.moderatable)),
            member && can(interaction, P.KickMembers) && button(`mod:user:kick:${id}`, "👢 Kick", ButtonStyle.Danger).setDisabled(!member.kickable),
            can(interaction, P.BanMembers) && (banned
                ? button(`mod:user:unban:${id}`, "✅ Unban", ButtonStyle.Success)
                : button(`mod:user:ban:${id}`, "🔨 Ban", ButtonStyle.Danger).setDisabled(member ? !member.bannable : false)),
            member && can(interaction, P.BanMembers) && button(`mod:user:softban:${id}`, "🧹 Softban", ButtonStyle.Danger).setDisabled(!member.bannable),
        ),
        rowOf(
            member && can(interaction, P.ManageNicknames) && button(`mod:user:nickname:${id}`, "✏️ Nickname").setDisabled(!member.manageable),
            member && can(interaction, P.ManageRoles) && button(`mod:roles:show:${id}`, "🎭 Roles"),
            can(interaction, P.ModerateMembers) && button(`mod:warnings:show:${id}`, "📋 Warnings"),
            homeButton(),
        ),
    ], notice);
}

module.exports = {
    userView,
    view: {
        id: "user",
        actions: {
            show: null,
            warn: P.ModerateMembers,
            timeout: P.ModerateMembers,
            untimeout: P.ModerateMembers,
            kick: P.KickMembers,
            ban: P.BanMembers,
            unban: P.BanMembers,
            softban: P.BanMembers,
            nickname: P.ManageNicknames,
        },

        async handleComponent(interaction, action, arg) {
            // Opened from a button (id in the custom id) or a menu (id in the picked value)
            if (action === "show") return interaction.update(await userView(interaction, arg ?? interaction.values[0]));
        },
    },
};
