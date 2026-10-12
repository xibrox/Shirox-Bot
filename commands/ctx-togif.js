const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const { findImageUrl } = require('../lib/gif');
const { replyWithGif } = require('./togif');

module.exports = {
  category: 'apps',
  description: "Convert the image in a message to a GIF",
  data: new ContextMenuCommandBuilder()
    .setName('Convert to GIF')
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    const url = findImageUrl(interaction.targetMessage);
    if (!url) return interaction.reply({ content: '❌ That message has no image.', ephemeral: true });
    await replyWithGif(interaction, url);
  },
};
