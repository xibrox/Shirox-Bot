const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { setSlowmode, replyResult } = require('../lib/modActions');

module.exports = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set the slowmode for this channel')
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('e.g. 5s, 1m, 2h (max 6h). Use "off" to disable')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),

  async execute(interaction) {
    const result = await setSlowmode(interaction, interaction.channel, interaction.options.getString('duration'));
    await replyResult(interaction, result);
  },
};
