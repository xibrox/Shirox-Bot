const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { warnUser, replyResult } = require('../lib/modActions');

module.exports = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member')
    .addUserOption(option => option.setName('user').setDescription('Member to warn').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for the warning').setMaxLength(400).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const result = await warnUser(interaction, interaction.options.getUser('user'), interaction.options.getString('reason'));
    await replyResult(interaction, result);
  },
};
