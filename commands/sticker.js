const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { addSticker } = require('../lib/expressions');

module.exports = {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('sticker')
    .setDescription('Add stickers to this server')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription("Add a sticker from another server, or make one from an image or GIF")
        .addStringOption(option => option.setName('sticker').setDescription('Sticker ID or link from another server'))
        .addAttachmentOption(option => option.setName('file').setDescription('Or an image, GIF or short video to turn into a sticker'))
        .addStringOption(option => option.setName('name').setDescription('Sticker name').setMinLength(2).setMaxLength(30))
        .addStringOption(option => option.setName('emoji').setDescription('Related emoji name used for suggestions (default: star)').setMaxLength(50)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
    .setDMPermission(false),

  async execute(interaction) {
    const source = interaction.options.getString('sticker');
    const file = interaction.options.getAttachment('file');
    if (!source && !file) {
      return interaction.reply({ content: '❌ Give me a sticker ID/link or attach a file.', flags: MessageFlags.Ephemeral });
    }

    if (file && file.size > 25 * 1024 * 1024) {
      return interaction.reply({ content: '❌ That file is too large (max 25 MB).', flags: MessageFlags.Ephemeral });
    }
    // Converting a GIF can take a few seconds
    await interaction.deferReply();
    const result = await addSticker(interaction, {
      source,
      fileUrl: file?.url,
      name: interaction.options.getString('name'),
      tag: interaction.options.getString('emoji'),
    });
    if (result.error) {
      await interaction.deleteReply().catch(() => {});
      return interaction.followUp({ content: result.error, flags: MessageFlags.Ephemeral });
    }
    await interaction.editReply(`✅ Added the sticker **${result.sticker.name}**.`);
  },
};
