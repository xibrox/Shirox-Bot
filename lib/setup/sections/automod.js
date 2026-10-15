const { PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { getGuildConfig, updateGuildConfig } = require("../../guildConfig");
const { sectionView, buttonRow, button, toggleButton } = require("../ui");

// [custom id part, settings key, button label]
const TOGGLES = [["invites", "automodInvites", "Invites"], ["links", "automodLinks", "Links"], ["spam", "automodSpam", "Spam"]];

const onOff = value => (value ? "✅ on" : "❌ off");

const MAX_ALLOWED = 25;
const INVITE_CODE = /(?:discord\.gg|discord(?:app)?\.com\/invite)\/([\w-]+)/i;

// An invite link, invite code or server ID -> { id, name } of the server, or null
async function resolveServer(client, text) {
    const input = text.trim();
    if (/^\d{17,20}$/.test(input)) return { id: input, name: client.guilds?.cache.get(input)?.name ?? `Server ${input}` };
    const code = input.match(INVITE_CODE)?.[1] ?? (/^[\w-]+$/.test(input) ? input : null);
    const invite = code && await client.fetchInvite(code).catch(() => null);
    return invite?.guild ? { id: invite.guild.id, name: invite.guild.name } : null;
}

// Empty counts as 0; anything else must be a whole number from 0 to max. Returns null if invalid.
function parseLimit(text, max) {
    const value = text.trim() || "0";
    if (!/^\d+$/.test(value)) return null;
    const number = Number(value);
    return number <= max ? number : null;
}

function limitInput(id, label, value) {
    return new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setMaxLength(3).setRequired(false).setValue(String(value ?? 0)));
}

const section = {
    id: "automod",
    label: "Automod",
    emoji: "🛡️",
    permission: PermissionFlagsBits.ManageGuild,

    status(config) {
        const on = TOGGLES.filter(([, key]) => config[key]).length
            + (config.automodMentionLimit ? 1 : 0) + (config.automodMinAccountAgeDays ? 1 : 0);
        return on ? `${on} of 5 rules on` : "off";
    },

    view(interaction, notice) {
        const c = getGuildConfig(interaction.guild.id);
        const allowed = c.automodInviteAllow ?? [];
        const description = [
            "Staff with **Manage Messages** are ignored.",
            "",
            `🔗 **Invites:** ${onOff(c.automodInvites)}, deletes invite links to other servers`,
            `🌐 **Links:** ${onOff(c.automodLinks)}, deletes all links`,
            `💬 **Spam:** ${onOff(c.automodSpam)}, times out members who send 5+ messages within 5 seconds`,
            `📣 **Mention limit:** ${c.automodMentionLimit ? `**${c.automodMentionLimit}** per message` : "❌ off"}`,
            `🆕 **Minimum account age:** ${c.automodMinAccountAgeDays ? `**${c.automodMinAccountAgeDays} day(s)**` : "❌ off"}`,
            "",
            `✅ **Invites allowed to:** ${allowed.length ? allowed.map(s => s.name).join(", ").slice(0, 1500) : "*no other servers*"}`,
        ].join("\n");
        return sectionView(section, description, [
            new ActionRowBuilder().addComponents(TOGGLES.map(([id, key, label]) => toggleButton(`setup:automod:toggle:${id}`, label, !!c[key]))),
            allowed.length && new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
                .setCustomId("setup:automod:unallow")
                .setPlaceholder("Stop allowing invites to…")
                .addOptions(allowed.map(s => ({ label: s.name.slice(0, 100), description: s.id, value: s.id })))),
            buttonRow(button("setup:automod:limits", "✏️ Limits"), button("setup:automod:allow", "✅ Allow a server")),
        ].filter(Boolean), notice);
    },

    async handleComponent(interaction, action, arg) {
        const { guild } = interaction;
        const config = getGuildConfig(guild.id);

        if (action === "toggle") {
            const toggle = TOGGLES.find(([id]) => id === arg);
            if (!toggle) return;
            const [, key, label] = toggle;
            updateGuildConfig(guild.id, { [key]: config[key] ? null : true });
            return interaction.update(section.view(interaction, `🛡️ ${label} filter: ${onOff(!config[key])}`));
        }
        if (action === "unallow") {
            const allowed = config.automodInviteAllow ?? [];
            const removed = allowed.find(s => s.id === interaction.values[0]);
            const rest = allowed.filter(s => s !== removed);
            updateGuildConfig(guild.id, { automodInviteAllow: rest.length ? rest : null });
            return interaction.update(section.view(interaction,
                removed ? `✅ Invites to **${removed.name}** are no longer allowed.` : "❌ That server isn't on the list."));
        }
        if (action === "allow") {
            return interaction.showModal(new ModalBuilder()
                .setCustomId("setup:automod:allow")
                .setTitle("Allow invites to a server")
                .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
                    .setCustomId("target").setLabel("Invite link or server ID").setStyle(TextInputStyle.Short)
                    .setRequired(true).setMaxLength(100).setPlaceholder("https://discord.gg/… or 123456789012345678"))));
        }
        if (action === "limits") {
            return interaction.showModal(new ModalBuilder()
                .setCustomId("setup:automod:limits")
                .setTitle("Automod limits")
                .addComponents(
                    limitInput("mentions", "Max mentions per message (0-50, 0 = off)", config.automodMentionLimit),
                    limitInput("age", "Minimum account age in days (0-365, 0 = off)", config.automodMinAccountAgeDays),
                ));
        }
    },

    async handleModal(interaction, action) {
        if (action === "allow") {
            const allowed = getGuildConfig(interaction.guild.id).automodInviteAllow ?? [];
            const server = await resolveServer(interaction.client, interaction.fields.getTextInputValue("target"));
            let notice;
            if (!server) notice = "❌ That isn't a valid invite link or server ID.";
            else if (allowed.some(s => s.id === server.id)) notice = `ℹ️ **${allowed.find(s => s.id === server.id).name}** is already allowed.`;
            else if (allowed.length >= MAX_ALLOWED) notice = `❌ The list is full (${MAX_ALLOWED} servers).`;
            else {
                updateGuildConfig(interaction.guild.id, { automodInviteAllow: [...allowed, server] });
                notice = `✅ Invites to **${server.name}** are allowed.`;
            }
            return interaction.update(section.view(interaction, notice));
        }
        if (action !== "limits") return;
        const mentions = parseLimit(interaction.fields.getTextInputValue("mentions"), 50);
        const days = parseLimit(interaction.fields.getTextInputValue("age"), 365);
        if (mentions === null || days === null) {
            return interaction.update(section.view(interaction, "❌ Use whole numbers: mentions 0–50, account age 0–365."));
        }
        if (days && !interaction.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) {
            return interaction.update(section.view(interaction, "❌ I need the **Kick Members** permission for the account age rule."));
        }
        updateGuildConfig(interaction.guild.id, { automodMentionLimit: mentions || null, automodMinAccountAgeDays: days || null });
        return interaction.update(section.view(interaction, "✅ Limits saved."));
    },
};

module.exports = section;
