const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { addEmoji } = require('../lib/expressions');

module.exports = {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('emoji')
    .setDescription('Add emoji to this server')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add an emoji from another server')
        .addStringOption(option => option.setName('emoji').setDescription('The emoji itself, its ID, or its link').setRequired(true))
        .addStringOption(option => option.setName('name').setDescription('Name for it here (defaults to its own name)').setMaxLength(32)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.deferReply();
    const result = await addEmoji(interaction, interaction.options.getString('emoji'), interaction.options.getString('name'));
    if (result.error) {
      await interaction.deleteReply().catch(() => {});
      return interaction.followUp({ content: result.error, flags: MessageFlags.Ephemeral });
    }
    await interaction.editReply(`✅ Added ${result.emoji} as \`:${result.emoji.name}:\`.`);
  },
};
