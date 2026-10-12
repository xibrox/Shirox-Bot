const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const { findMediaUrl } = require('../lib/gif');
const { replyWithGif } = require('./togif');

module.exports = {
  category: 'apps',
  description: "Convert the image or video in a message to a GIF (first 10s of videos)",
  data: new ContextMenuCommandBuilder()
    .setName('Convert to GIF')
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    const url = findMediaUrl(interaction.targetMessage);
    if (!url) return interaction.reply({ content: '❌ That message has no image or video.', ephemeral: true });
    await replyWithGif(interaction, url);
  },
};
