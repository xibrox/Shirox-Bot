const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { banUser, replyResult } = require('../lib/modActions');

module.exports = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .addUserOption(option => option.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for the ban').setMaxLength(400))
    .addIntegerOption(option =>
      option.setName('delete_messages')
        .setDescription('Delete their recent messages')
        .addChoices(
          { name: "Don't delete any", value: 0 },
          { name: 'Previous hour', value: 3600 },
          { name: 'Previous 24 hours', value: 86400 },
          { name: 'Previous 7 days', value: 604800 },
        ))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const result = await banUser(
      interaction,
      interaction.options.getUser('user'),
      interaction.options.getMember('user'),
      interaction.options.getString('reason') || 'No reason provided',
      interaction.options.getInteger('delete_messages') ?? 0,
    );
    await replyResult(interaction, result);
  },
};
