const crypto = require("node:crypto");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

// Drafts waiting behind a preview's buttons. Kept in memory only, so a restart expires them.
const TTL = 30 * 60_000;
const drafts = new Map();

function saveDraft(data) {
    const id = crypto.randomBytes(6).toString("hex");
    drafts.set(id, data);
    setTimeout(() => drafts.delete(id), TTL).unref();
    return id;
}

const getDraft = id => drafts.get(id);
const dropDraft = id => drafts.delete(id);

// Buttons under a preview: "<prefix>:confirm|edit|cancel:<draftId>", routed back to the command
function previewButtons(prefix, id, { confirm = "Post", edit = true, extra = [] } = {}) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${prefix}:confirm:${id}`).setLabel(confirm).setStyle(ButtonStyle.Success),
        ...(edit ? [new ButtonBuilder().setCustomId(`${prefix}:edit:${id}`).setLabel("Edit").setStyle(ButtonStyle.Secondary)] : []),
        ...extra,
        new ButtonBuilder().setCustomId(`${prefix}:cancel:${id}`).setLabel("Cancel").setStyle(ButtonStyle.Danger),
    );
}

// Replaces the preview message with a plain result line
const closePreview = content => ({ content, embeds: [], components: [] });
const EXPIRED = closePreview("⌛ This preview expired. Run the command again.");

module.exports = { saveDraft, getDraft, dropDraft, previewButtons, closePreview, EXPIRED };
