const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { parseDuration, formatDuration } = require('../lib/duration');

const MAX_SLOWMODE = 6 * 3_600_000;

module.exports = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set the slowmode for this channel')
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('e.g. 5s, 1m, 2h (max 6h). Use "off" to disable')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),

  async execute(interaction) {
    const input = interaction.options.getString('duration').trim().toLowerCase();
    const ms = ['off', '0'].includes(input) ? 0 : parseDuration(input);
    if (ms === null) return interaction.reply({ content: '⏰ Invalid duration. Examples: `5s`, `1m`, `off`.', flags: MessageFlags.Ephemeral });
    if (ms > MAX_SLOWMODE) return interaction.reply({ content: '⚠️ The maximum slowmode is 6 hours.', flags: MessageFlags.Ephemeral });

    try {
      await interaction.channel.setRateLimitPerUser(Math.floor(ms / 1000), `Set by ${interaction.user.tag}`);
      await interaction.reply(ms ? `🐢 Slowmode set to **${formatDuration(ms)}**.` : '✅ Slowmode disabled.');
    } catch {
      await interaction.reply({ content: "❌ I couldn't change the slowmode. Do I have **Manage Channels**?", flags: MessageFlags.Ephemeral });
    }
  },
};
