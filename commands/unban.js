const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { unbanUser, replyResult } = require('../lib/modActions');

module.exports = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user')
    .addStringOption(option => option.setName('user_id').setDescription('ID of the user to unban').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for the unban').setMaxLength(400))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const result = await unbanUser(
      interaction, interaction.options.getString('user_id').trim(), interaction.options.getString('reason') || 'No reason provided',
    );
    await replyResult(interaction, result);
  },
};
