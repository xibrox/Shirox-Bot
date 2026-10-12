const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { parseDuration, formatDuration } = require('../lib/duration');

module.exports = {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('remindme')
    .setDescription('Set a reminder')
    .addStringOption(option =>
      option.setName('time')
        .setDescription('Time (e.g., 10m, 1h, 2d)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Reminder message')
        .setRequired(true)),
  async execute(interaction) {
    const timeInput = interaction.options.getString('time');
    const reminderMsg = interaction.options.getString('message');

    const ms = parseDuration(timeInput);
    if (!ms) {
      return interaction.reply({
        content: "⏰ Usage example: `/remindme 10m check the oven`",
        flags: MessageFlags.Ephemeral
      });
    }

    const MAX_DELAY = 2_147_483_647;

    if (ms > MAX_DELAY)
      return interaction.reply("⚠️ Sorry, the maximum reminder time is 24 days.");

    // ✅ Send confirmation in the same channel
    await interaction.reply(`⏳ I'll remind you in **${formatDuration(ms)}**: "${reminderMsg}"`);

    // DM reminder
    setTimeout(() => {
      interaction.user.send(`⏰ Reminder: ${reminderMsg}`).catch(() => {
        console.log(`❌ Failed to DM ${interaction.user.tag}`);
      });
    }, ms);
  },
};
