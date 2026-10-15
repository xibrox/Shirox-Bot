const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { kickMember, replyResult } = require('../lib/modActions');

module.exports = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .addUserOption(option => option.setName('user').setDescription('Member to kick').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for the kick').setMaxLength(400))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const result = await kickMember(
      interaction, interaction.options.getMember('user'), interaction.options.getString('reason') || 'No reason provided',
    );
    await replyResult(interaction, result);
  },
};
