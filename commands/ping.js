const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription("Check the bot's latency"),

  async execute(interaction) {
    const { resource } = await interaction.reply({ content: '🏓 Pinging...', withResponse: true });
    const roundTrip = resource.message.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`🏓 Pong! Round trip: **${roundTrip}ms** · WebSocket: **${interaction.client.ws.ping}ms**`);
  },
};
