const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { checkAssignableRole } = require('../lib/moderation');

module.exports = {
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
    const target = interaction.options.getMember('user');
    const role = interaction.options.getRole('role');
    if (!target) return interaction.reply({ content: '❌ That user is not in this server.', ephemeral: true });

    const error = checkAssignableRole(interaction, role);
    if (error) return interaction.reply({ content: error, ephemeral: true });

    const hasRole = target.roles.cache.has(role.id);
    if (adding && hasRole) return interaction.reply({ content: `${target} already has ${role}.`, ephemeral: true });
    if (!adding && !hasRole) return interaction.reply({ content: `${target} doesn't have ${role}.`, ephemeral: true });

    const reason = `By ${interaction.user.tag}`;
    await (adding ? target.roles.add(role, reason) : target.roles.remove(role, reason));
    await interaction.reply({
      content: adding ? `✅ Gave ${role} to ${target}.` : `✅ Removed ${role} from ${target}.`,
      allowedMentions: { parse: [] },
    });
  },
};
