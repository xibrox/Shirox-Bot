const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  category: 'fun',
  data: new SlashCommandBuilder()
    .setName('kotomi-violin')
    .setDescription("Play Kotomi's legendary violin 🎻"),
  async execute(interaction) {
    await interaction.reply("🎻 Kotomi is playing her violin... brace yourself!");
    await interaction.followUp("https://i.pinimg.com/originals/3c/cb/88/3ccb880fea751a2517550761c85c20c8.gif");
  },
};
