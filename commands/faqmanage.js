const {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType,
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder,
} = require('discord.js');
const { getFaqs, findFaq, addFaq, updateFaq, removeFaq, faqChoices } = require('../lib/faq');
const { EMBED_COLOR } = require('../lib/colors');

function faqModal(customId, title, faq) {
  const question = new TextInputBuilder()
    .setCustomId('question').setLabel('Question').setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(true);
  const answer = new TextInputBuilder()
    .setCustomId('answer').setLabel('Answer').setStyle(TextInputStyle.Paragraph).setMaxLength(4000).setRequired(true);
  if (faq) {
    question.setValue(faq.question);
    answer.setValue(faq.answer);
  }
  return new ModalBuilder().setCustomId(customId).setTitle(title).addComponents(
    new ActionRowBuilder().addComponents(question),
    new ActionRowBuilder().addComponents(answer),
  );
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
      if (!faq) return interaction.reply({ content: '❌ Pick a question from the list.', ephemeral: true });
      if (sub === 'edit') return interaction.showModal(faqModal(`faqmanage:edit:${faq.id}`, 'Edit FAQ', faq));
      removeFaq(guildId, faq.id);
      return interaction.reply({ content: `🗑️ Removed **${faq.question}**.\nRepost any FAQ panels to update their dropdown.`, ephemeral: true });
    }

    // panel
    const faqs = getFaqs(guildId);
    if (!faqs.length) return interaction.reply({ content: '❌ Add some FAQs first with `/faqmanage add`.', ephemeral: true });
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle('❓ Frequently Asked Questions')
      .setDescription('Pick a question from the menu below to see the answer.\n\n' + faqs.slice(0, 25).map(f => `• ${f.question}`).join('\n'));
    const menu = new StringSelectMenuBuilder()
      .setCustomId('faq:select')
      .setPlaceholder('Choose a question…')
      .addOptions(faqs.slice(0, 25).map(f => ({ label: f.question.slice(0, 100), value: String(f.id) })));

    try {
      await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
      const note = faqs.length > 25 ? '\n⚠️ Only the first 25 questions fit in a dropdown.' : '';
      await interaction.reply({ content: `✅ FAQ panel posted in ${channel}.${note}`, ephemeral: true });
    } catch {
      await interaction.reply({ content: `❌ I couldn't post in ${channel}.`, ephemeral: true });
    }
  },

  async autocomplete(interaction) {
    await interaction.respond(faqChoices(interaction.guild.id, interaction.options.getFocused()));
  },

  async handleModal(interaction) {
    const [, action, id] = interaction.customId.split(':');
    const question = interaction.fields.getTextInputValue('question').trim();
    const answer = interaction.fields.getTextInputValue('answer').trim();

    if (action === 'edit') {
      const faq = updateFaq(interaction.guild.id, id, question, answer);
      return interaction.reply({
        content: faq ? `✅ Updated **${question}**.\nRepost any FAQ panels to update their dropdown.` : '❌ That FAQ no longer exists.',
        ephemeral: true,
      });
    }
    addFaq(interaction.guild.id, question, answer);
    await interaction.reply({ content: `✅ Added **${question}**.`, ephemeral: true });
  },
};
