const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('pick')
    .setDescription('Pick a random server member')
    .setDMPermission(false),
  async execute(interaction) {
    // Fetching everyone can be rate limited on big servers; the cached members are good enough then
    const members = await interaction.guild.members.fetch().catch(() => interaction.guild.members.cache);
    const onlineMembers = members.filter(m => !m.user.bot);
    if (onlineMembers.size === 0) {
      await interaction.reply("❌ No active members to pick from.");
    } else {
      const names = Array.from(onlineMembers.values());
      const picked = names[Math.floor(Math.random() * names.length)];
      await interaction.reply(`🎯 I pick: **${picked.user.username}**!`);
    }
  },
};
