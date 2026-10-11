const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { checkHierarchy } = require('../lib/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .addUserOption(option => option.setName('user').setDescription('Member to kick').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for the kick').setMaxLength(400))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    if (!target) return interaction.reply({ content: '❌ That user is not in this server.', ephemeral: true });

    const error = checkHierarchy(interaction, target);
    if (error) return interaction.reply({ content: error, ephemeral: true });
    if (!target.kickable) return interaction.reply({ content: "❌ I can't kick that member.", ephemeral: true });

    await target.send(`👢 You were kicked from **${interaction.guild.name}**. Reason: ${reason}`).catch(() => {});
    await target.kick(`${interaction.user.tag}: ${reason}`);
    await interaction.reply(`👢 Kicked **${target.user.tag}**. Reason: ${reason}`);
  },
};
