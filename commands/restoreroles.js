const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getGuildConfig, updateGuildConfig } = require('../lib/guildConfig');

module.exports = {
  category: 'setup',
  data: new SlashCommandBuilder()
    .setName('restoreroles')
    .setDescription('Give members their old roles and nickname back when they leave and rejoin')
    .addBooleanOption(option => option.setName('enabled').setDescription('On or off').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    const enabled = interaction.options.getBoolean('enabled');
    if (enabled && !interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ content: '❌ I need the **Manage Roles** permission for this.', flags: MessageFlags.Ephemeral });
    }
    updateGuildConfig(interaction.guild.id, { restoreRoles: enabled || null });
    // Cache everyone's roles now so members who leave before ever being seen still get saved
    if (enabled) interaction.guild.members.fetch().catch(() => {});

    if (!enabled) return interaction.reply({ content: '✅ Role restore disabled.', flags: MessageFlags.Ephemeral });
    await interaction.reply({
      content: '✅ Role restore enabled. When a member leaves, their roles and nickname are saved and given back if they rejoin.\n' +
        '• Banned members are never restored.\n' +
        '• Roles with **Administrator**, or above my highest role, are skipped for safety.\n' +
        '• Only members who leave *after* enabling this are saved.',
      flags: MessageFlags.Ephemeral,
    });
    if (getGuildConfig(interaction.guild.id).autoRoleId) {
      await interaction.followUp({ content: 'ℹ️ Your auto role will still be given to everyone who joins, including returning members.', flags: MessageFlags.Ephemeral });
    }
  },
};
