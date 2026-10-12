const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const { convertToGif, MAX_CLIP_SECONDS, DEFAULT_CLIP_SECONDS } = require('../lib/gif');

async function replyWithGif(interaction, url, clip) {
  await interaction.deferReply();
  try {
    const gif = await convertToGif(url, clip);
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
    .setDescription('Convert an image or video to a GIF (PNG, JPG, WebP, HEIC, AVIF, MP4, MOV, WebM...)')
    .addAttachmentOption(option => option.setName('file').setDescription('Image or video to convert'))
    .addStringOption(option => option.setName('url').setDescription('Or a link to an image/video'))
    .addNumberOption(option =>
      option.setName('start')
        .setDescription('Videos: where to start, in seconds (default: 0)')
        .setMinValue(0))
    .addNumberOption(option =>
      option.setName('length')
        .setDescription(`Videos: how many seconds to convert (default: ${DEFAULT_CLIP_SECONDS}, max: ${MAX_CLIP_SECONDS})`)
        .setMinValue(0.5)
        .setMaxValue(MAX_CLIP_SECONDS)),

  async execute(interaction) {
    const attachment = interaction.options.getAttachment('file');
    const url = attachment?.url || interaction.options.getString('url');
    if (!url) {
      return interaction.reply({ content: '❌ Give me a file or a link. You can also right-click a message → **Apps → Convert to GIF**.', flags: MessageFlags.Ephemeral });
    }
    if (!/^https?:\/\//i.test(url)) return interaction.reply({ content: '❌ That is not a valid link.', flags: MessageFlags.Ephemeral });

    await replyWithGif(interaction, url, {
      start: interaction.options.getNumber('start') ?? 0,
      duration: interaction.options.getNumber('length') ?? DEFAULT_CLIP_SECONDS,
    });
  },
};
