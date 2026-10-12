const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getFaqs, findFaq, faqChoices } = require('../lib/faq');
const { EMBED_COLOR } = require('../lib/colors');

function faqEmbed(faq) {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`❓ ${faq.question}`)
    .setDescription(faq.answer);
}

module.exports = {
  category: 'utility',
  faqEmbed,
  data: new SlashCommandBuilder()
    .setName('faq')
    .setDescription('Frequently asked questions')
    .addSubcommand(sub =>
      sub.setName('show')
        .setDescription('Show the answer to a question')
        .addStringOption(option =>
          option.setName('question').setDescription('Start typing to search').setAutocomplete(true).setRequired(true))
        .addUserOption(option => option.setName('user').setDescription('Mention someone with the answer')))
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all questions'))
    .setDMPermission(false),

  async execute(interaction) {
    const guildId = interaction.guild.id;

    if (interaction.options.getSubcommand() === 'list') {
      const faqs = getFaqs(guildId);
      if (!faqs.length) return interaction.reply({ content: 'There are no FAQs yet. Staff can add some with `/faqmanage add`.', flags: MessageFlags.Ephemeral });
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(`❓ FAQ: ${interaction.guild.name}`)
        .setDescription(faqs.map(f => `**${f.id}.** ${f.question}`).join('\n').slice(0, 4096))
        .setFooter({ text: 'Use /faq show to see an answer' });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const faq = findFaq(guildId, interaction.options.getString('question'));
    if (!faq) return interaction.reply({ content: '❌ Pick a question from the list.', flags: MessageFlags.Ephemeral });
    const user = interaction.options.getUser('user');
    await interaction.reply({ content: user ? `${user}` : undefined, embeds: [faqEmbed(faq)] });
  },

  async autocomplete(interaction) {
    await interaction.respond(faqChoices(interaction.guild.id, interaction.options.getFocused()));
  },

  // Dropdown on the panel posted by /faqmanage panel (customId "faq:select")
  async handleComponent(interaction) {
    const faq = findFaq(interaction.guild.id, interaction.values[0]);
    if (!faq) return interaction.reply({ content: '❌ That question was removed.', flags: MessageFlags.Ephemeral });
    await interaction.reply({ embeds: [faqEmbed(faq)], flags: MessageFlags.Ephemeral });
  },
};
