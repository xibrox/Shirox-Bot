const { PermissionFlagsBits, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { checkAssignableRole } = require("../../moderation");
const { MAX_SELF_ROLES, buildSelfRolePanel } = require("../../selfRoles");
const { saveDraft, getDraft, dropDraft, EXPIRED } = require("../../preview");
const { sectionView, rolePicker, buttonRow } = require("../ui");

const section = {
    id: "selfroles",
    label: "Self roles",
    emoji: "🎭",
    permission: PermissionFlagsBits.ManageRoles,

    status: () => "post a panel",

    view(interaction, notice) {
        const description = [
            "Post a panel of buttons members click to give themselves roles.",
            "",
            `1. Pick up to ${MAX_SELF_ROLES} roles below.`,
            "2. Fill in the title and description.",
            "3. The panel is posted in this channel.",
        ].join("\n");
        return sectionView(section, description, [
            rolePicker("setup:selfroles:roles", [], { placeholder: "Pick the roles…", max: MAX_SELF_ROLES }),
            buttonRow(),
        ], notice);
    },

    async handleComponent(interaction, action) {
        if (action !== "roles") return;
        const roles = interaction.values.map(id => interaction.guild.roles.cache.get(id)).filter(Boolean);
        if (!roles.length) return interaction.update(section.view(interaction, "❌ I can't find those roles."));
        for (const role of roles) {
            const error = checkAssignableRole(interaction, role);
            if (error) return interaction.update(section.view(interaction, error));
        }

        // Ten role ids don't fit in a custom id, so the form carries a draft id instead
        const draftId = saveDraft({ roleIds: roles.map(r => r.id) });
        return interaction.showModal(new ModalBuilder()
            .setCustomId(`setup:selfroles:post:${draftId}`)
            .setTitle("Self-role panel")
            .addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder()
                    .setCustomId("title").setLabel("Title").setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder()
                    .setCustomId("description").setLabel("Text shown above the buttons").setStyle(TextInputStyle.Paragraph)
                    .setMaxLength(1000).setRequired(false)),
            ));
    },

    async handleModal(interaction, action, draftId) {
        if (action !== "post") return;
        const draft = getDraft(draftId);
        if (!draft) return interaction.update(section.view(interaction, EXPIRED.content));
        dropDraft(draftId);

        const roles = draft.roleIds.map(id => interaction.guild.roles.cache.get(id)).filter(Boolean);
        const title = interaction.fields.getTextInputValue("title").trim();
        const description = interaction.fields.getTextInputValue("description").trim() || null;
        const sent = await interaction.channel.send(buildSelfRolePanel(title, description, roles)).then(() => true, () => false);
        return interaction.update(section.view(interaction, sent ? "✅ Self-role panel posted." : "❌ I couldn't post in this channel."));
    },
};

module.exports = section;
