const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { softbanMember, replyResult } = require('../lib/modActions');

module.exports = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('softban')
    .setDescription('Remove a member and delete their recent messages (they can rejoin)')
    .addUserOption(option => option.setName('user').setDescription('Member to soft ban').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason').setMaxLength(400))
    .addIntegerOption(option =>
      option.setName('delete_messages')
        .setDescription('How much message history to delete (default: 24 hours)')
        .addChoices(
          { name: 'Previous hour', value: 3600 },
          { name: 'Previous 24 hours', value: 86400 },
          { name: 'Previous 7 days', value: 604800 },
        ))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const result = await softbanMember(
      interaction,
      interaction.options.getMember('user'),
      interaction.options.getString('reason') || 'No reason provided',
      interaction.options.getInteger('delete_messages') ?? 86_400,
    );
    await replyResult(interaction, result);
  },
};
