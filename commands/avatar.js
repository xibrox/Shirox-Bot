const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("Show a user's avatar")
    .addUserOption(option => option.setName('user').setDescription('User (defaults to you)')),

  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const url = user.displayAvatarURL({ size: 1024 });
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`${user.username}'s avatar`)
      .setURL(url)
      .setImage(url);
    await interaction.reply({ embeds: [embed] });
  },
};
