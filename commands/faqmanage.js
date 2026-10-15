const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { getFaqs, findFaq, addFaq, updateFaq, removeFaq, faqChoices, faqModal, savedFaqPanel } = require('../lib/faq');
const { faqEmbed } = require('./faq');
const { saveDraft, getDraft, dropDraft, previewButtons, closePreview, EXPIRED } = require('../lib/preview');

function previewMessage(id, draft) {
  return {
    content: `**Preview** of how ${draft.faqId ? 'the edited' : 'the new'} FAQ looks.`,
    embeds: [faqEmbed(draft)],
    components: [previewButtons('faqmanage', id, { confirm: 'Save' })],
  };
}

const questionOption = option =>
  option.setName('question').setDescription('Start typing to search').setAutocomplete(true).setRequired(true);

module.exports = {
  category: 'setup',
  data: new SlashCommandBuilder()
    .setName('faqmanage')
    .setDescription('Add, edit and remove FAQs, or post an FAQ panel')
    .addSubcommand(sub => sub.setName('add').setDescription('Add a question (opens a form)'))
    .addSubcommand(sub => sub.setName('edit').setDescription('Edit a question (opens a form)').addStringOption(questionOption))
    .addSubcommand(sub => sub.setName('remove').setDescription('Remove a question').addStringOption(questionOption))
    .addSubcommand(sub =>
      sub.setName('panel')
        .setDescription('Post an FAQ panel with a dropdown members can pick questions from')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Where to post it (defaults to this channel)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'add') return interaction.showModal(faqModal('faqmanage:add', 'Add FAQ'));

    if (sub === 'edit' || sub === 'remove') {
      const faq = findFaq(guildId, interaction.options.getString('question'));
      if (!faq) return interaction.reply({ content: '❌ Pick a question from the list.', flags: MessageFlags.Ephemeral });
      if (sub === 'edit') return interaction.showModal(faqModal(`faqmanage:edit:${faq.id}`, 'Edit FAQ', faq));
      removeFaq(guildId, faq.id);
      return interaction.reply({ content: `🗑️ Removed **${faq.question}**.\nRepost any FAQ panels to update their dropdown.`, flags: MessageFlags.Ephemeral });
    }

    // panel
    const faqs = getFaqs(guildId);
    if (!faqs.length) return interaction.reply({ content: '❌ Add some FAQs first with `/faqmanage add`.', flags: MessageFlags.Ephemeral });
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    try {
      await channel.send(savedFaqPanel(guildId, faqs));
      const note = faqs.length > 25 ? '\n⚠️ Only the first 25 questions fit in a dropdown.' : '';
      await interaction.reply({ content: `✅ FAQ panel posted in ${channel}.${note}`, flags: MessageFlags.Ephemeral });
    } catch {
      await interaction.reply({ content: `❌ I couldn't post in ${channel}.`, flags: MessageFlags.Ephemeral });
    }
  },

  async autocomplete(interaction) {
    await interaction.respond(faqChoices(interaction.guild.id, interaction.options.getFocused()));
  },

  // Form submitted: "faqmanage:add|edit:<faqId>" opens a preview, "faqmanage:revise:<draftId>" updates one
  async handleModal(interaction) {
    const [, action, id] = interaction.customId.split(':');
    const question = interaction.fields.getTextInputValue('question').trim();
    const answer = interaction.fields.getTextInputValue('answer').trim();

    if (action === 'revise') {
      const draft = getDraft(id);
      if (!draft) return interaction.update(EXPIRED);
      Object.assign(draft, { question, answer });
      return interaction.update(previewMessage(id, draft));
    }

    const draft = { faqId: action === 'edit' ? id : null, question, answer };
    await interaction.reply({ ...previewMessage(saveDraft(draft), draft), flags: MessageFlags.Ephemeral });
  },

  // Save / Edit / Cancel under a preview
  async handleComponent(interaction) {
    const [, action, id] = interaction.customId.split(':');
    const draft = getDraft(id);
    if (!draft) return interaction.update(EXPIRED);

    if (action === 'edit') return interaction.showModal(faqModal(`faqmanage:revise:${id}`, 'Edit FAQ', draft));
    dropDraft(id);
    if (action === 'cancel') return interaction.update(closePreview('Cancelled, nothing was saved.'));

    const { faqId, question, answer } = draft;
    if (faqId) {
      const faq = updateFaq(interaction.guild.id, faqId, question, answer);
      return interaction.update(closePreview(faq
        ? `✅ Updated **${question}**.\nRepost any FAQ panels to update their dropdown.`
        : '❌ That FAQ no longer exists.'));
    }
    addFaq(interaction.guild.id, question, answer);
    await interaction.update(closePreview(`✅ Added **${question}**.`));
  },
};
