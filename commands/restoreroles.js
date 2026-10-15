const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getGuildConfig } = require('../lib/guildConfig');
const { setRestoreRoles, RESTORE_RULES, AUTOROLE_NOTE } = require('../lib/restoreRoles');

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
    const error = setRestoreRoles(interaction.guild, enabled);
    if (error) return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });

    if (!enabled) return interaction.reply({ content: '✅ Role restore disabled.', flags: MessageFlags.Ephemeral });
    await interaction.reply({ content: `✅ Role restore enabled. ${RESTORE_RULES}`, flags: MessageFlags.Ephemeral });
    if (getGuildConfig(interaction.guild.id).autoRoleId) {
      await interaction.followUp({ content: AUTOROLE_NOTE, flags: MessageFlags.Ephemeral });
    }
  },
};
