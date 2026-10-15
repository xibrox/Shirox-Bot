const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { setLock, replyResult } = require('../lib/modActions');

module.exports = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock or unlock this channel for @everyone')
    .addBooleanOption(option =>
      option.setName('unlock')
        .setDescription('Unlock the channel instead'))
    .addStringOption(option => option.setName('reason').setDescription('Reason').setMaxLength(400))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),

  async execute(interaction) {
    const unlock = interaction.options.getBoolean('unlock') ?? false;
    const result = await setLock(interaction, interaction.channel, !unlock, interaction.options.getString('reason'));
    await replyResult(interaction, result);
  },
};
