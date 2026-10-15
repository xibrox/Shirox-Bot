const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { addEmoji, addSticker } = require('../lib/expressions');

// Custom emoji anywhere in a message, e.g. "<:smile:123>"
const EMOJI_MENTIONS = /<a?:\w{2,32}:\d{17,20}>/g;
const MAX_EMOJI = 5;

module.exports = {
  category: 'apps',
  description: 'Copy the custom emoji (up to 5) and sticker in a message into this server',
  data: new ContextMenuCommandBuilder()
    .setName('Add emoji/sticker here')
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
    .setDMPermission(false),

  async execute(interaction) {
    const message = interaction.targetMessage;
    const emojis = [...new Set(message.content.match(EMOJI_MENTIONS) ?? [])].slice(0, MAX_EMOJI);
    const sticker = message.stickers.first();
    if (!emojis.length && !sticker) {
      return interaction.reply({ content: '❌ That message has no custom emoji or sticker.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const lines = [];
    for (const emoji of emojis) {
      const result = await addEmoji(interaction, emoji, null);
      lines.push(result.error ? `${emoji}: ${result.error}` : `✅ Added ${result.emoji}`);
    }
    if (sticker) {
      const result = await addSticker(interaction, { source: sticker.id, name: sticker.name });
      lines.push(result.error ? `Sticker **${sticker.name}**: ${result.error}` : `✅ Added the sticker **${result.sticker.name}**`);
    }
    await interaction.editReply(lines.join('\n'));
  },
};
