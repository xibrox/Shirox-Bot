const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription("Check the bot's latency"),

  async execute(interaction) {
    const sent = await interaction.reply({ content: '🏓 Pinging...', fetchReply: true });
    const roundTrip = sent.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`🏓 Pong! Round trip: **${roundTrip}ms** · WebSocket: **${interaction.client.ws.ping}ms**`);
  },
};
