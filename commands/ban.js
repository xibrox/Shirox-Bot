const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { checkHierarchy } = require('../lib/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .addUserOption(option => option.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for the ban').setMaxLength(400))
    .addIntegerOption(option =>
      option.setName('delete_messages')
        .setDescription('Delete their recent messages')
        .addChoices(
          { name: "Don't delete any", value: 0 },
          { name: 'Previous hour', value: 3600 },
          { name: 'Previous 24 hours', value: 86400 },
          { name: 'Previous 7 days', value: 604800 },
        ))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const deleteMessageSeconds = interaction.options.getInteger('delete_messages') ?? 0;

    // Users who aren't in the server can still be banned (hackban)
    if (target) {
      const error = checkHierarchy(interaction, target);
      if (error) return interaction.reply({ content: error, ephemeral: true });
      if (!target.bannable) return interaction.reply({ content: "❌ I can't ban that member.", ephemeral: true });
      await target.send(`🔨 You were banned from **${interaction.guild.name}**. Reason: ${reason}`).catch(() => {});
    }

    try {
      await interaction.guild.members.ban(user, { reason: `${interaction.user.tag}: ${reason}`, deleteMessageSeconds });
      await interaction.reply(`🔨 Banned **${user.tag}**. Reason: ${reason}`);
    } catch (err) {
      console.error('❌ Ban failed:', err);
      await interaction.reply({ content: '❌ Failed to ban that user. Do I have **Ban Members**?', ephemeral: true });
    }
  },
};
