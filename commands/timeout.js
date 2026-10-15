const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { timeoutMember, replyResult } = require('../lib/modActions');

module.exports = {
  category: 'moderation',
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
    const result = await timeoutMember(
      interaction,
      interaction.options.getMember('user'),
      interaction.options.getString('duration'),
      interaction.options.getString('reason') || 'No reason provided',
    );
    await replyResult(interaction, result);
  },
};
