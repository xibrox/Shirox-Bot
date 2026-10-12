const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Make the bot say something (optionally in another channel)')
    .addStringOption(option =>
      option
        .setName('message')
        .setDescription('The message to send')
        .setRequired(true))
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel to send the message in (optional)')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),

  async execute(interaction) {
    const message = interaction.options.getString('message');
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

    try {
      await targetChannel.send(message);
      await interaction.reply({ content: `✅ Message sent in ${targetChannel}`, ephemeral: true });
    } catch (err) {
      console.error('❌ Failed to send message:', err);
      await interaction.reply({ content: '⚠️ Failed to send your message.', ephemeral: true });
    }
  },
};
