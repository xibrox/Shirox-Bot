const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const { convertToGif, MAX_CLIP_SECONDS, DEFAULT_CLIP_SECONDS } = require('../lib/gif');
const { downloadSticker, parseStickerSource } = require('../lib/expressions');
const { stickerToGif } = require('../lib/stickerFile');

async function replyWithGif(interaction, url, clip) {
  await interaction.deferReply();
  try {
    const gif = await convertToGif(url, clip);
    await interaction.editReply({ files: [new AttachmentBuilder(gif, { name: 'converted.gif' })] });
  } catch (err) {
    await interaction.editReply(`❌ ${err.message}`);
  }
}

// Stickers are fetched by ID so animated (APNG) stickers stay animated
async function replyWithStickerGif(interaction, stickerId) {
  await interaction.deferReply();
  const found = await downloadSticker(interaction.client, stickerId, fetch);
  if (found.error) return interaction.editReply(found.error);
  try {
    const gif = await stickerToGif(found.buffer);
    await interaction.editReply({ files: [new AttachmentBuilder(gif, { name: `${found.name ?? 'sticker'}.gif` })] });
  } catch (err) {
    await interaction.editReply(`❌ ${err.message}`);
  }
}

module.exports = {
  category: 'utility',
  replyWithGif,
  replyWithStickerGif,
  data: new SlashCommandBuilder()
    .setName('togif')
    .setDescription('Convert an image, video or sticker to a GIF (PNG, JPG, WebP, HEIC, MP4, MOV...)')
    .addAttachmentOption(option => option.setName('file').setDescription('Image or video to convert'))
    .addStringOption(option => option.setName('url').setDescription('Or a link to an image/video'))
    .addStringOption(option => option.setName('sticker').setDescription('Or a sticker ID or link'))
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
    const stickerSource = interaction.options.getString('sticker');
    if (stickerSource) {
      const stickerId = parseStickerSource(stickerSource);
      if (!stickerId) return interaction.reply({ content: '❌ That is not a sticker ID or link.', flags: MessageFlags.Ephemeral });
      return replyWithStickerGif(interaction, stickerId);
    }
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
