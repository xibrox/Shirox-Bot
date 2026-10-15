const { PermissionFlagsBits, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const { getFaqs, findFaq, removeFaq, faqModal, faqPanel } = require("../../faq");
const { missingChannelPermissions, SEND_EMBED_PERMISSIONS } = require("../../channelChecks");
const { sectionView, channelPicker, buttonRow, button, pickedChannel, CHANNEL_GONE } = require("../ui");

const section = {
    id: "faq",
    label: "FAQ",
    emoji: "❓",
    permission: PermissionFlagsBits.ManageGuild,

    status(config, guild) {
        const count = getFaqs(guild.id).length;
        return count ? `${count} question${count === 1 ? "" : "s"}` : "none yet";
    },

    // `selectedId` is the question picked in the menu, which Edit and Remove act on
    view(interaction, notice, selectedId) {
        const faqs = getFaqs(interaction.guild.id);
        const shown = faqs.slice(0, 25);
        const selected = selectedId ? findFaq(interaction.guild.id, selectedId) : null;

        const lines = [`**${faqs.length}** question(s). Members read them with \`/faq\` or an FAQ panel.`];
        if (shown.length) lines.push("", ...shown.map(f => `• ${f.question.slice(0, 100)}`));
        if (faqs.length > shown.length) lines.push(`…and ${faqs.length - shown.length} more (only the first 25 fit in menus).`);
        if (selected) lines.push("", `**Selected:** ${selected.question}`);

        const components = [];
        if (shown.length) {
            components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
                .setCustomId("setup:faq:pick")
                .setPlaceholder("Pick a question to edit or remove…")
                .addOptions(shown.map(f => ({ label: f.question.slice(0, 100), value: String(f.id), default: f.id === selected?.id })))));
        }
        components.push(
            channelPicker("setup:faq:panel", null, { placeholder: "Post the FAQ panel in…" }),
            buttonRow(
                button("setup:faq:add", "➕ Add", ButtonStyle.Success),
                button(`setup:faq:edit:${selected?.id ?? 0}`, "✏️ Edit").setDisabled(!selected),
                button(`setup:faq:remove:${selected?.id ?? 0}`, "🗑️ Remove", ButtonStyle.Danger).setDisabled(!selected),
            ),
        );
        return sectionView(section, lines.join("\n"), components, notice);
    },

    async handleComponent(interaction, action, arg) {
        const { guild } = interaction;

        if (action === "pick") return interaction.update(section.view(interaction, undefined, interaction.values[0]));
        // The add/edit forms use faqmanage's ids, so saving goes through its existing preview flow
        if (action === "add") return interaction.showModal(faqModal("faqmanage:add", "Add FAQ"));
        if (action === "edit") {
            const faq = findFaq(guild.id, arg);
            if (!faq) return interaction.update(section.view(interaction, "❌ That question no longer exists."));
            return interaction.showModal(faqModal(`faqmanage:edit:${faq.id}`, "Edit FAQ", faq));
        }
        if (action === "remove") {
            const removed = removeFaq(guild.id, arg);
            return interaction.update(section.view(interaction, removed
                ? `🗑️ Removed **${removed.question}**.\nRepost any FAQ panels to update their dropdown.`
                : "❌ That question no longer exists."));
        }
        if (action === "panel") {
            const faqs = getFaqs(guild.id);
            if (!faqs.length) return interaction.update(section.view(interaction, "❌ Add some questions first."));
            const channel = pickedChannel(interaction);
            const error = channel ? missingChannelPermissions(channel, guild.members.me, SEND_EMBED_PERMISSIONS) : CHANNEL_GONE;
            if (error) return interaction.update(section.view(interaction, error));
            const sent = await channel.send(faqPanel(faqs)).then(() => true, () => false);
            const note = faqs.length > 25 ? "\n⚠️ Only the first 25 questions fit in a dropdown." : "";
            return interaction.update(section.view(interaction, sent ? `✅ FAQ panel posted in ${channel}.${note}` : `❌ I couldn't post in ${channel}.`));
        }
    },
};

module.exports = section;
