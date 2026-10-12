const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

const FILTERS = {
  bots: m => m.author.bot,
  humans: m => !m.author.bot,
  links: m => /https?:\/\//i.test(m.content),
  attachments: m => m.attachments.size > 0,
};

// How far back to look for matching messages when a user/filter is given
const FILTER_SCAN_LIMIT = 100;
const MAX_SKIP = 500;

// Fetches up to `count` messages from newest to oldest, paging 100 at a time
async function fetchNewest(channel, count) {
  const messages = [];
  let before;
  while (messages.length < count) {
    const page = await channel.messages.fetch({ limit: Math.min(100, count - messages.length), before });
    if (!page.size) break;
    messages.push(...page.values());
    before = page.last().id;
  }
  return messages;
}

module.exports = {
  category: 'moderation',
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
    .addIntegerOption(option =>
      option.setName('skip')
        .setDescription(`Keep the newest N messages and start deleting above them (0–${MAX_SKIP})`)
        .setMinValue(0)
        .setMaxValue(MAX_SKIP))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const user = interaction.options.getUser('user');
    const filter = interaction.options.getString('filter');
    const skip = interaction.options.getInteger('skip') ?? 0;
    const filtering = user || filter;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      let toDelete;
      if (!filtering && !skip) {
        toDelete = amount;
      } else {
        // Skip the newest `skip` messages, then take matching ones from there upwards
        const fetched = await fetchNewest(interaction.channel, skip + (filtering ? FILTER_SCAN_LIMIT : amount));
        toDelete = fetched
          .slice(skip)
          .filter(m => (!user || m.author.id === user.id) && (!filter || FILTERS[filter](m)))
          .slice(0, amount);
        if (!toDelete.length) return interaction.editReply('Nothing matched, so nothing was deleted.');
      }

      const deleted = await interaction.channel.bulkDelete(toDelete, true);
      const requested = typeof toDelete === 'number' ? amount : toDelete.length;
      const skipped = requested - deleted.size;
      await interaction.editReply(
        `✅ Deleted **${deleted.size}** message(s)${skip ? ` (kept the newest ${skip})` : ''}.` +
        (skipped > 0 ? `\n⚠️ ${skipped} couldn't be deleted (older than 14 days or not found).` : ''),
      );
    } catch (err) {
      console.error('❌ Purge failed:', err);
      await interaction.editReply('❌ Failed to delete messages. Make sure I have **Manage Messages** in this channel.');
    }
  },
};
