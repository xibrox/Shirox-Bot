const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getSupportInviteUrl } = require('../lib/supportInvite');

module.exports = {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('shirox')
    .setDescription('Get the invite link to the Shirox server'),

  async execute(interaction) {
    await interaction.deferReply();
    const url = await getSupportInviteUrl(interaction.client);
    if (!url) {
      await interaction.deleteReply();
      return interaction.followUp({ content: "❌ The Shirox invite isn't available right now. Please try again later.", flags: MessageFlags.Ephemeral });
    }
    // Discord turns the link into a join card on its own
    await interaction.editReply(`🌸 Join the Shirox server: ${url}`);
  },
};
