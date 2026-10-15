const {
    PermissionFlagsBits, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
    MessageFlags,
} = require("discord.js");
const { checkAssignableRole } = require("../../moderation");
const { MAX_SELF_ROLES, buildSelfRolePanel } = require("../../selfRoles");
const { getPanels, findPanel, savePanel, removePanel, parseMessageLink, readPanelMessage } = require("../../selfRolePanels");
const { missingChannelPermissions, SEND_EMBED_PERMISSIONS } = require("../../channelChecks");
const { saveDraft, getDraft, dropDraft } = require("../../preview");
const {
    sectionView, channelPicker, rolePicker, buttonRow, button, channelText, roleText, pickedChannel, CHANNEL_GONE, savedChannel, savedRoles,
    TEXT_CHANNELS,
} = require("../ui");

const PANEL_GONE = "❌ That panel's message was deleted, so I removed it from the list.";
const UNREACHABLE = "❌ I couldn't reach that panel's message. Check that I can see its channel.";
const DRAFT_EXPIRED = "⌛ That draft expired. Start a new panel.";
// Discord error codes meaning the channel or message is really gone (not just out of reach)
const GONE_CODES = new Set([10003, 10008]);
const NOT_LISTED = "❌ That panel is no longer in the list.";

const rolesOf = (guild, roleIds) => roleIds.map(id => guild.roles.cache.get(id)).filter(Boolean);

// Returns an error message if any picked role can't be handed out by the bot, otherwise null
function rolesError(interaction, roles) {
    if (!roles.length) return "❌ I can't find those roles.";
    for (const role of roles) {
        const error = checkAssignableRole(interaction, role);
        if (error) return error;
    }
    return null;
}

// The panel as it would be posted, with buttons disabled so a preview can't change anyone's roles
function previewPayload(guild, panel) {
    const payload = buildSelfRolePanel(panel.title, panel.description, rolesOf(guild, panel.roleIds));
    for (const row of payload.components) for (const component of row.components) component.setDisabled(true);
    return { ...payload, flags: MessageFlags.Ephemeral };
}

function textModal(customId, current) {
    const title = new TextInputBuilder()
        .setCustomId("title").setLabel("Title").setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(true);
    const description = new TextInputBuilder()
        .setCustomId("description").setLabel("Text above the buttons (empty = default)").setStyle(TextInputStyle.Paragraph)
        .setMaxLength(1000).setRequired(false);
    if (current.title) title.setValue(current.title);
    if (current.description) description.setValue(current.description);
    return new ModalBuilder().setCustomId(customId).setTitle("Self-role panel").addComponents(
        new ActionRowBuilder().addComponents(title),
        new ActionRowBuilder().addComponents(description),
    );
}

function listView(interaction, notice) {
    const { guild } = interaction;
    const panels = getPanels(guild.id);
    const shown = panels.slice(0, 25);
    const lines = [
        "Panels of buttons members click to give themselves roles.",
        "",
        panels.length
            ? `**${panels.length}** panel(s). Pick one to change its roles or text.`
            : "No panels yet. Make one with **➕ New panel**, or add one posted earlier with **🔗 Add existing panel**.",
    ];
    if (panels.length > shown.length) lines.push("…only the first 25 fit in the menu.");

    const components = [];
    if (shown.length) {
        components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId("setup:selfroles:open")
            .setPlaceholder("Pick a panel to edit…")
            .addOptions(shown.map(p => ({
                label: `${p.title.slice(0, 60)} · #${(guild.channels.cache.get(p.channelId)?.name ?? "deleted-channel").slice(0, 30)}`,
                value: p.messageId,
            })))));
    }
    components.push(buttonRow(
        button("setup:selfroles:new", "➕ New panel", ButtonStyle.Success),
        button("setup:selfroles:adopt", "🔗 Add existing panel"),
    ));
    return sectionView(section, lines.join("\n"), components, notice);
}

function newView(interaction, notice, draftId) {
    const draft = getDraft(draftId);
    if (!draft) return listView(interaction, DRAFT_EXPIRED);
    const { guild } = interaction;
    const ready = draft.channelId && draft.roleIds.length && draft.title;
    const description = [
        "**New panel**",
        "",
        `**Channel:** ${channelText(draft.channelId)}`,
        `**Title:** ${draft.title || "*not set, use ✏️ Text*"}`,
        `**Text:** ${draft.description || "*default*"}`,
        `**Roles:** ${draft.roleIds.length ? draft.roleIds.map(roleText).join(" ") : "*none yet*"}`,
    ].join("\n");
    return sectionView(section, description, [
        channelPicker(`setup:selfroles:newchannel:${draftId}`, savedChannel(guild, draft.channelId), { placeholder: "Post it in…" }),
        rolePicker(`setup:selfroles:newroles:${draftId}`, savedRoles(guild, ...draft.roleIds), {
            placeholder: `Pick up to ${MAX_SELF_ROLES} roles…`, max: MAX_SELF_ROLES,
        }),
        new ActionRowBuilder().addComponents(
            button(`setup:selfroles:newtext:${draftId}`, "✏️ Text"),
            button(`setup:selfroles:newpreview:${draftId}`, "👁️ Preview").setDisabled(!draft.roleIds.length || !draft.title),
            button(`setup:selfroles:post:${draftId}`, "📤 Post", ButtonStyle.Primary).setDisabled(!ready),
        ),
        buttonRow(button("setup:selfroles:list", "◀ Back")),
    ], notice);
}

function editView(interaction, notice, messageId, confirmDelete = false) {
    const { guild } = interaction;
    const panel = findPanel(guild.id, messageId);
    if (!panel) return listView(interaction, NOT_LISTED);
    const description = [
        `**Panel:** ${panel.title}`,
        `**Channel:** ${channelText(panel.channelId)} · [jump to message](https://discord.com/channels/${guild.id}/${panel.channelId}/${panel.messageId})`,
        `**Text:** ${panel.description || "*default*"}`,
        `**Roles (${panel.roleIds.length}):** ${panel.roleIds.map(roleText).join(" ")}`,
        "",
        "Changing the roles or text updates the posted panel right away.",
    ].join("\n");
    const actions = confirmDelete
        ? new ActionRowBuilder().addComponents(
            button(`setup:selfroles:confirmdelete:${messageId}`, "Confirm delete", ButtonStyle.Danger),
            button(`setup:selfroles:edit:${messageId}`, "Cancel"),
        )
        : new ActionRowBuilder().addComponents(
            button(`setup:selfroles:text:${messageId}`, "✏️ Text"),
            button(`setup:selfroles:preview:${messageId}`, "👁️ Preview"),
            button(`setup:selfroles:delete:${messageId}`, "🗑️ Delete panel", ButtonStyle.Danger),
        );
    return sectionView(section, description, [
        rolePicker(`setup:selfroles:roles:${messageId}`, savedRoles(guild, ...panel.roleIds), {
            placeholder: "Roles on this panel…", max: MAX_SELF_ROLES,
        }),
        actions,
        buttonRow(button("setup:selfroles:list", "◀ Back")),
    ], notice);
}

// { message } when the panel's message can be reached, { gone: true } when it was deleted, {} otherwise
async function fetchPanelMessage(guild, panel) {
    try {
        const channel = guild.channels.cache.get(panel.channelId) ?? await guild.channels.fetch(panel.channelId);
        return { message: await channel.messages.fetch(panel.messageId) };
    } catch (err) {
        return { gone: GONE_CODES.has(err.code) };
    }
}

// Re-posts a changed panel into its message and saves it; drops panels whose message is gone
async function applyPanel(interaction, panel) {
    const { guild } = interaction;
    const { message, gone } = await fetchPanelMessage(guild, panel);
    if (gone) {
        removePanel(guild.id, panel.messageId);
        return interaction.update(listView(interaction, PANEL_GONE));
    }
    if (!message) return interaction.update(editView(interaction, UNREACHABLE, panel.messageId));
    const roles = rolesOf(guild, panel.roleIds);
    const edited = await message.edit(buildSelfRolePanel(panel.title, panel.description, roles)).then(() => true, () => false);
    if (!edited) return interaction.update(editView(interaction, "❌ I couldn't edit that panel.", panel.messageId));
    savePanel(guild.id, { ...panel, roleIds: roles.map(r => r.id) });
    return interaction.update(editView(interaction, "✅ Panel updated.", panel.messageId));
}

const section = {
    id: "selfroles",
    label: "Self roles",
    emoji: "🎭",
    permission: PermissionFlagsBits.ManageRoles,

    status(config, guild) {
        const count = getPanels(guild.id).length;
        return count ? `${count} panel${count === 1 ? "" : "s"}` : "no panels";
    },

    view(interaction, notice, mode = {}) {
        if (mode.draftId) return newView(interaction, notice, mode.draftId);
        if (mode.messageId) return editView(interaction, notice, mode.messageId, mode.confirmDelete);
        return listView(interaction, notice);
    },

    async handleComponent(interaction, action, arg) {
        const { guild } = interaction;

        if (action === "list") return interaction.update(listView(interaction));
        if (action === "open") return interaction.update(editView(interaction, undefined, interaction.values[0]));
        if (action === "edit") return interaction.update(editView(interaction, undefined, arg));
        if (action === "delete") return interaction.update(editView(interaction, undefined, arg, true));
        if (action === "new") {
            // Start in the current channel, but only if the panel could actually be posted there
            const here = guild.channels.cache.get(interaction.channelId);
            const usable = here && TEXT_CHANNELS.includes(here.type) && !missingChannelPermissions(here, guild.members.me, SEND_EMBED_PERMISSIONS);
            const draftId = saveDraft({ channelId: usable ? here.id : null, roleIds: [], title: null, description: null });
            return interaction.update(newView(interaction, undefined, draftId));
        }
        if (action === "adopt") {
            return interaction.showModal(new ModalBuilder()
                .setCustomId("setup:selfroles:adopt")
                .setTitle("Add an existing panel")
                .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
                    .setCustomId("link").setLabel("Message link").setStyle(TextInputStyle.Short).setRequired(true)
                    .setPlaceholder("Right-click the panel → Copy Message Link"))));
        }

        // New panel steps
        if (["newchannel", "newroles", "newtext", "newpreview", "post"].includes(action)) {
            const draft = getDraft(arg);
            if (!draft) return interaction.update(listView(interaction, DRAFT_EXPIRED));

            if (action === "newchannel") {
                const channel = pickedChannel(interaction);
                const error = channel ? missingChannelPermissions(channel, guild.members.me, SEND_EMBED_PERMISSIONS) : CHANNEL_GONE;
                if (!error) draft.channelId = channel.id;
                return interaction.update(newView(interaction, error ?? `✅ It will be posted in ${channel}.`, arg));
            }
            if (action === "newroles") {
                const roles = rolesOf(guild, interaction.values);
                const error = rolesError(interaction, roles);
                if (!error) draft.roleIds = roles.map(r => r.id);
                return interaction.update(newView(interaction, error ?? `✅ ${roles.length} role(s) picked.`, arg));
            }
            if (action === "newtext") return interaction.showModal(textModal(`setup:selfroles:newtext:${arg}`, draft));
            if (action === "newpreview") return interaction.reply(previewPayload(guild, draft));

            // post
            const channel = guild.channels.cache.get(draft.channelId);
            if (!channel) return interaction.update(newView(interaction, CHANNEL_GONE, arg));
            const roles = rolesOf(guild, draft.roleIds);
            const error = rolesError(interaction, roles) ?? (draft.title ? null : "❌ Set a title with ✏️ Text first.");
            if (error) return interaction.update(newView(interaction, error, arg));
            // A double click would otherwise post the panel twice
            if (draft.posting) return interaction.update(newView(interaction, "⏳ That panel is already being posted.", arg));
            draft.posting = true;
            const message = await channel.send(buildSelfRolePanel(draft.title, draft.description, roles)).catch(() => null);
            draft.posting = false;
            if (!message) return interaction.update(newView(interaction, `❌ I couldn't post in ${channel}.`, arg));
            savePanel(guild.id, {
                messageId: message.id, channelId: channel.id, title: draft.title, description: draft.description, roleIds: roles.map(r => r.id),
            });
            dropDraft(arg);
            return interaction.update(editView(interaction, `✅ Panel posted in ${channel}.`, message.id));
        }

        // Existing panel steps
        if (["roles", "text", "preview", "confirmdelete"].includes(action)) {
            const panel = findPanel(guild.id, arg);
            if (!panel) return interaction.update(listView(interaction, NOT_LISTED));

            if (action === "roles") {
                const roles = rolesOf(guild, interaction.values);
                const error = rolesError(interaction, roles);
                if (error) return interaction.update(editView(interaction, error, arg));
                return applyPanel(interaction, { ...panel, roleIds: roles.map(r => r.id) });
            }
            if (action === "text") return interaction.showModal(textModal(`setup:selfroles:text:${arg}`, panel));
            if (action === "preview") return interaction.reply(previewPayload(guild, panel));

            // confirmdelete: a message that's already gone is fine; one we can't delete is not
            const { message, gone } = await fetchPanelMessage(guild, panel);
            if (!message && !gone) return interaction.update(editView(interaction, UNREACHABLE, arg));
            const deleted = !message || await message.delete().then(() => true, err => GONE_CODES.has(err.code));
            if (!deleted) return interaction.update(editView(interaction, "❌ I couldn't delete that panel's message.", arg));
            removePanel(guild.id, panel.messageId);
            return interaction.update(listView(interaction, `🗑️ Deleted **${panel.title}**.`));
        }
    },

    async handleModal(interaction, action, arg) {
        const { guild } = interaction;

        if (action === "adopt") {
            const link = parseMessageLink(interaction.fields.getTextInputValue("link"));
            if (!link || link.guildId !== guild.id) return interaction.update(listView(interaction, "❌ That link isn't a message in this server."));
            const channel = guild.channels.cache.get(link.channelId);
            const message = channel && await channel.messages.fetch(link.messageId).catch(() => null);
            if (!message) return interaction.update(listView(interaction, "❌ I can't find that message."));
            const panel = readPanelMessage(message, interaction.client.user.id);
            if (!panel) return interaction.update(listView(interaction, "❌ That isn't a self-role panel I posted."));
            savePanel(guild.id, panel);
            return interaction.update(editView(interaction, `✅ Added **${panel.title}** to the list.`, panel.messageId));
        }

        const title = interaction.fields.getTextInputValue("title").trim();
        const description = interaction.fields.getTextInputValue("description").trim() || null;

        if (action === "newtext") {
            const draft = getDraft(arg);
            if (!draft) return interaction.update(listView(interaction, DRAFT_EXPIRED));
            if (!title) return interaction.update(newView(interaction, "❌ The title can't be empty.", arg));
            Object.assign(draft, { title, description });
            return interaction.update(newView(interaction, "✅ Text saved.", arg));
        }
        if (action === "text") {
            const panel = findPanel(guild.id, arg);
            if (!panel) return interaction.update(listView(interaction, NOT_LISTED));
            if (!title) return interaction.update(editView(interaction, "❌ The title can't be empty.", arg));
            return applyPanel(interaction, { ...panel, title, description });
        }
    },
};

module.exports = section;
