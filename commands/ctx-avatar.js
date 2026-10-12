const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const { buildAvatarReply } = require('./avatar');

module.exports = {
  category: 'apps',
  description: "Show a user's avatar",
  data: new ContextMenuCommandBuilder()
    .setName('Avatar')
    .setType(ApplicationCommandType.User),

  async execute(interaction) {
    await interaction.reply(await buildAvatarReply(interaction.targetUser, interaction.targetMember));
  },
};
