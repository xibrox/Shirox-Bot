const { ContextMenuCommandBuilder, ApplicationCommandType, InteractionContextType } = require('discord.js');
const { asOwnerCommand } = require('../lib/owner');
const { openMessageModal } = require('./todo');

module.exports = {
  category: 'owner',
  ownerOnly: true,
  description: 'Turn a message (a bug report, suggestion, ...) into a card in the todo channel',
  data: asOwnerCommand(new ContextMenuCommandBuilder()
    .setName('Add to todo')
    .setType(ApplicationCommandType.Message))
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    await openMessageModal(interaction, interaction.targetMessage);
  },
};
