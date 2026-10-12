const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildConfig, updateGuildConfig } = require('../lib/guildConfig');
const { checkAssignableRole } = require('../lib/moderation');

module.exports = {
  category: 'setup',
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Automatically give a role to new members')
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Set the role given to new members')
        .addRoleOption(option => option.setName('role').setDescription('Role to give').setRequired(true))
        .addBooleanOption(option => option.setName('bots').setDescription('Set the role for new bots instead of humans')))
    .addSubcommand(sub =>
      sub.setName('disable')
        .setDescription('Stop giving a role to new members')
        .addBooleanOption(option => option.setName('bots').setDescription('Disable the bot auto role instead of the human one')))
    .addSubcommand(sub =>
      sub.setName('show')
        .setDescription('Show the current auto role settings'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const forBots = interaction.options.getBoolean('bots') ?? false;
    const key = forBots ? 'botAutoRoleId' : 'autoRoleId';
    const label = forBots ? 'new bots' : 'new members';

    if (sub === 'set') {
      const role = interaction.options.getRole('role');
      const error = checkAssignableRole(interaction, role);
      if (error) return interaction.reply({ content: error, ephemeral: true });

      updateGuildConfig(interaction.guild.id, { [key]: role.id });
      return interaction.reply({ content: `✅ ${role} will now be given to ${label}.`, ephemeral: true });
    }

    if (sub === 'disable') {
      updateGuildConfig(interaction.guild.id, { [key]: null });
      return interaction.reply({ content: `✅ Auto role for ${label} disabled.`, ephemeral: true });
    }

    const config = getGuildConfig(interaction.guild.id);
    const show = id => (id ? `<@&${id}>` : '*not set*');
    await interaction.reply({
      content: `👤 Members: ${show(config.autoRoleId)}\n🤖 Bots: ${show(config.botAutoRoleId)}`,
      ephemeral: true,
    });
  },
};
