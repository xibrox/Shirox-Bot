const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { convertToGif } = require('../lib/gif');

async function replyWithGif(interaction, url) {
  await interaction.deferReply();
  try {
    const gif = await convertToGif(url);
    await interaction.editReply({ files: [new AttachmentBuilder(gif, { name: 'converted.gif' })] });
  } catch (err) {
    await interaction.editReply(`❌ ${err.message}`);
  }
}

module.exports = {
  category: 'utility',
  replyWithGif,
  data: new SlashCommandBuilder()
    .setName('togif')
    .setDescription('Convert an image to a GIF (so you can favorite it in Discord)')
    .addAttachmentOption(option => option.setName('image').setDescription('Image to convert'))
    .addStringOption(option => option.setName('url').setDescription('Or a link to an image')),

  async execute(interaction) {
    const attachment = interaction.options.getAttachment('image');
    const url = attachment?.url || interaction.options.getString('url');
    if (!url) {
      return interaction.reply({ content: '❌ Give me an image or a link to one. You can also right-click a message → **Apps → Convert to GIF**.', ephemeral: true });
    }
    if (!/^https?:\/\//i.test(url)) return interaction.reply({ content: '❌ That is not a valid link.', ephemeral: true });
    await replyWithGif(interaction, url);
  },
};
