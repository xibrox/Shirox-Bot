const { ContextMenuCommandBuilder, ApplicationCommandType, MessageFlags } = require('discord.js');
const { buildUserInfoEmbed } = require('./userinfo');

module.exports = {
  category: 'apps',
  description: "Show information about a user (only you see it)",
  data: new ContextMenuCommandBuilder()
    .setName('User Info')
    .setType(ApplicationCommandType.User)
    .setDMPermission(false),

  async execute(interaction) {
    const embed = await buildUserInfoEmbed(interaction, interaction.targetUser, interaction.targetMember);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
