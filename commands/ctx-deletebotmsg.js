const { ContextMenuCommandBuilder, ApplicationCommandType, Routes, MessageFlags } = require('discord.js');
const { asOwnerCommand } = require('../lib/owner');

module.exports = {
  category: 'owner',
  ownerOnly: true,
  description: 'Delete a message the bot sent (owner only, works without server permissions)',
  data: asOwnerCommand(new ContextMenuCommandBuilder()
    .setName('Delete bot message')
    .setType(ApplicationCommandType.Message)),

  async execute(interaction) {
    const message = interaction.targetMessage;
    if (message.author.id !== interaction.client.user.id) {
      return interaction.reply({ content: '❌ That message was not sent by me.', flags: MessageFlags.Ephemeral });
    }
    // Bots can always delete their own messages, no Manage Messages needed. Going through REST
    // means it works even when the channel isn't cached.
    try {
      await interaction.client.rest.delete(Routes.channelMessage(message.channelId, message.id));
      await interaction.reply({ content: '🗑️ Deleted.', flags: MessageFlags.Ephemeral });
    } catch (err) {
      await interaction.reply({ content: `❌ Couldn't delete it: ${err.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
