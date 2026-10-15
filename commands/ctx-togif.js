const { ContextMenuCommandBuilder, ApplicationCommandType, MessageFlags } = require('discord.js');
const { findMediaUrl } = require('../lib/gif');
const { replyWithGif, replyWithStickerGif } = require('./togif');

module.exports = {
  category: 'apps',
  description: "Convert the image, video or sticker in a message to a GIF (first 10s of videos)",
  data: new ContextMenuCommandBuilder()
    .setName('Convert to GIF')
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    const url = findMediaUrl(interaction.targetMessage);
    const sticker = interaction.targetMessage.stickers?.first();
    if (!url && sticker) return replyWithStickerGif(interaction, sticker.id);
    if (!url) return interaction.reply({ content: '❌ That message has no image or video.', flags: MessageFlags.Ephemeral });
    await replyWithGif(interaction, url);
  },
};
