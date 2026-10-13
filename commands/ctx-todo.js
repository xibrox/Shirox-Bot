const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const { openMessageModal } = require('./todo');

module.exports = {
  category: 'apps',
  description: 'Turn a message (a bug report, suggestion, ...) into a card in the todo channel',
  data: new ContextMenuCommandBuilder()
    .setName('Add to todo')
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    await openMessageModal(interaction, interaction.targetMessage);
  },
};
