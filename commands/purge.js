const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const FILTERS = {
  bots: m => m.author.bot,
  humans: m => !m.author.bot,
  links: m => /https?:\/\//i.test(m.content),
  attachments: m => m.attachments.size > 0,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk delete messages in this channel')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Number of messages to delete (1–100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true))
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Only delete messages from this user'))
    .addStringOption(option =>
      option.setName('filter')
        .setDescription('Only delete a certain kind of message')
        .addChoices(
          { name: 'Bots', value: 'bots' },
          { name: 'Humans', value: 'humans' },
          { name: 'Links', value: 'links' },
          { name: 'Attachments', value: 'attachments' },
        ))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const user = interaction.options.getUser('user');
    const filter = interaction.options.getString('filter');

    await interaction.deferReply({ ephemeral: true });

    try {
      let toDelete;
      if (user || filter) {
        // Scan the last 100 messages and delete up to `amount` that match
        const fetched = await interaction.channel.messages.fetch({ limit: 100 });
        toDelete = [...fetched
          .filter(m => (!user || m.author.id === user.id) && (!filter || FILTERS[filter](m)))
          .values()].slice(0, amount);
      } else {
        toDelete = amount;
      }

      const deleted = await interaction.channel.bulkDelete(toDelete, true);
      const skipped = (typeof toDelete === 'number' ? amount : toDelete.length) - deleted.size;
      await interaction.editReply(
        `✅ Deleted **${deleted.size}** message(s).` +
        (skipped > 0 ? `\n⚠️ ${skipped} couldn't be deleted (older than 14 days or not found).` : ''),
      );
    } catch (err) {
      console.error('❌ Purge failed:', err);
      await interaction.editReply('❌ Failed to delete messages. Make sure I have **Manage Messages** in this channel.');
    }
  },
};
