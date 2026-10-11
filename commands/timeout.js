const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { checkHierarchy } = require('../lib/moderation');
const { parseDuration, formatDuration } = require('../lib/duration');

const MAX_TIMEOUT = 28 * 86_400_000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout (mute) a member, or remove their timeout')
    .addUserOption(option => option.setName('user').setDescription('Member to timeout').setRequired(true))
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('e.g. 10m, 1h, 2d (max 28d). Use "off" to remove a timeout')
        .setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for the timeout').setMaxLength(400))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const target = interaction.options.getMember('user');
    const durationInput = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    if (!target) return interaction.reply({ content: '❌ That user is not in this server.', ephemeral: true });

    const error = checkHierarchy(interaction, target);
    if (error) return interaction.reply({ content: error, ephemeral: true });
    if (!target.moderatable) return interaction.reply({ content: "❌ I can't timeout that member.", ephemeral: true });

    if (['off', 'remove', 'none', '0'].includes(durationInput.trim().toLowerCase())) {
      await target.timeout(null, `${interaction.user.tag}: ${reason}`);
      return interaction.reply(`🔊 Removed timeout from **${target.user.tag}**.`);
    }

    const ms = parseDuration(durationInput);
    if (!ms) return interaction.reply({ content: '⏰ Invalid duration. Examples: `10m`, `1h`, `2d`.', ephemeral: true });
    if (ms > MAX_TIMEOUT) return interaction.reply({ content: '⚠️ The maximum timeout is 28 days.', ephemeral: true });

    await target.timeout(ms, `${interaction.user.tag}: ${reason}`);
    await interaction.reply(`🔇 Timed out **${target.user.tag}** for **${formatDuration(ms)}**. Reason: ${reason}`);
  },
};
