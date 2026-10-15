const { PermissionFlagsBits: P, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const actions = require("../../modActions");
const { getWarnings } = require("../../warnings");
const { getHistory, formatEntry } = require("../../modHistory");
const { button, homeButton, rowOf, modEmbed, panel, can, fetchMember, finishAction } = require("../ui");
const { homeView, NO_USER } = require("./home");

const unix = ms => Math.floor(ms / 1000);
const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

async function userView(interaction, userId, notice) {
    const { guild } = interaction;
    const user = await interaction.client.users.fetch(userId).catch(() => null);
    if (!user) return homeView(interaction, NO_USER);
    const member = await fetchMember(guild, userId);
    const banned = !member && can(interaction, P.BanMembers, "ban") ? !!(await guild.bans.fetch({ user: userId, force: true }).catch(() => null)) : false;
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
    if (!member && can(interaction, P.BanMembers, "ban")) embed.addFields({ name: "Banned", value: banned ? "yes" : "no", inline: true });
    const newest = warnings.slice(-3).reverse().map(w => `#${w.id} · ${clip(w.reason, 200)} · <t:${unix(w.timestamp)}:R>`);
    embed.addFields(
        { name: "Warnings", value: clip([`${warnings.length}`, ...newest].join("\n"), 1024) },
        { name: "Recent history", value: clip(history.map(formatEntry).join("\n") || "none", 1024) },
    );

    const id = user.id;
    return panel(embed, [
        rowOf(
            can(interaction, P.ModerateMembers, "warn") && button(`mod:user:warn:${id}`, "⚠️ Warn"),
            member && can(interaction, P.ModerateMembers, "timeout") && (timedOut
                ? button(`mod:user:untimeout:${id}`, "🔊 Remove timeout", ButtonStyle.Success)
                : button(`mod:user:timeout:${id}`, "⏱️ Timeout").setDisabled(!member.moderatable)),
            member && can(interaction, P.KickMembers, "kick") && button(`mod:user:kick:${id}`, "👢 Kick", ButtonStyle.Danger).setDisabled(!member.kickable),
            can(interaction, P.BanMembers, banned ? "unban" : "ban") && (banned
                ? button(`mod:user:unban:${id}`, "✅ Unban", ButtonStyle.Success)
                : button(`mod:user:ban:${id}`, "🔨 Ban", ButtonStyle.Danger).setDisabled(member ? !member.bannable : false)),
            member && can(interaction, P.BanMembers, "softban") && button(`mod:user:softban:${id}`, "🧹 Softban", ButtonStyle.Danger).setDisabled(!member.bannable),
        ),
        rowOf(
            member && can(interaction, P.ManageNicknames, "mod") && button(`mod:user:nickname:${id}`, "✏️ Nickname").setDisabled(!member.manageable),
            member && can(interaction, P.ManageRoles, "role") && button(`mod:roles:show:${id}`, "🎭 Roles"),
            can(interaction, P.ModerateMembers, "warnings") && button(`mod:warnings:show:${id}`, "📋 Warnings"),
            homeButton(),
        ),
    ], notice);
}

const input = (id, label, { required = false, max = 400, placeholder, value, long = false } = {}) => {
    const field = new TextInputBuilder().setCustomId(id).setLabel(label).setRequired(required).setMaxLength(max)
        .setStyle(long ? TextInputStyle.Paragraph : TextInputStyle.Short);
    if (placeholder) field.setPlaceholder(placeholder);
    if (value) field.setValue(value);
    return new ActionRowBuilder().addComponents(field);
};

// The form each button opens: [title, fields]
const FORMS = {
    warn: () => ["Warn", [input("reason", "Reason", { required: true, long: true })]],
    timeout: () => ["Timeout", [input("duration", "Duration (e.g. 10m, 1h, 2d; max 28d)", { required: true, max: 10 }), input("reason", "Reason")]],
    kick: () => ["Kick", [input("reason", "Reason")]],
    ban: () => ["Ban", [input("reason", "Reason"), input("delete", "Delete messages from the last", { max: 3, placeholder: "0, 1h, 24h or 7d" })]],
    softban: () => ["Softban", [input("reason", "Reason")]],
    unban: () => ["Unban", [input("reason", "Reason")]],
    nickname: member => ["Nickname", [input("nickname", "New nickname (empty to reset)", { max: 32, value: member?.nickname })]],
};

const reasonOf = interaction => interaction.fields.getTextInputValue("reason").trim() || "No reason provided";

module.exports = {
    userView,
    view: {
        id: "user",
        actions: {
            show: P.ModerateMembers,
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
            const render = notice => userView(interaction, arg, notice);
            if (action === "untimeout") {
                const member = await fetchMember(interaction.guild, arg);
                return finishAction(interaction, await actions.timeoutMember(interaction, member, "off", "Removed with /mod"), render);
            }
            if (!FORMS[action]) return;
            const [title, fields] = FORMS[action](await fetchMember(interaction.guild, arg));
            return interaction.showModal(new ModalBuilder().setCustomId(`mod:user:${action}:${arg}`).setTitle(title).addComponents(...fields));
        },

        async handleModal(interaction, action, userId) {
            const { guild } = interaction;
            const render = notice => userView(interaction, userId, notice);
            const user = await interaction.client.users.fetch(userId).catch(() => null);
            if (!user) return interaction.update(await homeView(interaction, NO_USER));
            const member = await fetchMember(guild, userId);
            let result;
            if (action === "warn") {
                const reason = interaction.fields.getTextInputValue("reason").trim();
                result = reason ? await actions.warnUser(interaction, user, reason) : { error: "❌ A reason is required." };
            }
            else if (action === "timeout") {
                result = await actions.timeoutMember(interaction, member, interaction.fields.getTextInputValue("duration"), reasonOf(interaction));
            } else if (action === "kick") result = await actions.kickMember(interaction, member, reasonOf(interaction));
            else if (action === "ban") {
                const seconds = actions.parseDeleteWindow(interaction.fields.getTextInputValue("delete"));
                result = seconds === null
                    ? { error: "❌ Delete messages must be 0, 1h, 24h or 7d." }
                    : await actions.banUser(interaction, user, member, reasonOf(interaction), seconds);
            } else if (action === "softban") result = await actions.softbanMember(interaction, member, reasonOf(interaction));
            else if (action === "unban") result = await actions.unbanUser(interaction, userId, reasonOf(interaction));
            else if (action === "nickname") {
                result = await actions.setNickname(interaction, member, interaction.fields.getTextInputValue("nickname").trim() || null);
            } else return;
            return finishAction(interaction, result, render);
        },
    },
};
