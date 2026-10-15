const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { changeRoles, replyResult } = require('../lib/modActions');

module.exports = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Add or remove a role from a member')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Give a role to a member')
        .addUserOption(option => option.setName('user').setDescription('Member').setRequired(true))
        .addRoleOption(option => option.setName('role').setDescription('Role to give').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a role from a member')
        .addUserOption(option => option.setName('user').setDescription('Member').setRequired(true))
        .addRoleOption(option => option.setName('role').setDescription('Role to remove').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false),

  async execute(interaction) {
    const adding = interaction.options.getSubcommand() === 'add';
    const result = await changeRoles(interaction, interaction.options.getMember('user'), [interaction.options.getRole('role')], adding);
    await replyResult(interaction, result);
  },
};
