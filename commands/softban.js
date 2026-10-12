const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { checkHierarchy, softban } = require('../lib/moderation');
const { createLogEmbed, sendLog, userField, suppressLogsFor } = require('../lib/logger');

module.exports = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('softban')
    .setDescription('Remove a member and delete their recent messages (they can rejoin)')
    .addUserOption(option => option.setName('user').setDescription('Member to soft ban').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason').setMaxLength(400))
    .addIntegerOption(option =>
      option.setName('delete_messages')
        .setDescription('How much message history to delete (default: 24 hours)')
        .addChoices(
          { name: 'Previous hour', value: 3600 },
          { name: 'Previous 24 hours', value: 86400 },
          { name: 'Previous 7 days', value: 604800 },
        ))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const deleteMessageSeconds = interaction.options.getInteger('delete_messages') ?? 86_400;
    if (!target) return interaction.reply({ content: '❌ That user is not in this server.', flags: MessageFlags.Ephemeral });

    const error = checkHierarchy(interaction, target);
    if (error) return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });
    if (!target.bannable) return interaction.reply({ content: "❌ I can't ban that member.", flags: MessageFlags.Ephemeral });

    await target.send(
      `🧹 You were soft banned from **${interaction.guild.name}** (removed and recent messages deleted). You can rejoin. Reason: ${reason}`,
    ).catch(() => {});

    try {
      suppressLogsFor(target.id);
      await softban(interaction.guild, target.id, `${interaction.user.tag}: ${reason}`, deleteMessageSeconds);
    } catch (err) {
      console.error('❌ Soft ban failed:', err);
      return interaction.reply({ content: '❌ Soft ban failed. Do I have **Ban Members**?', flags: MessageFlags.Ephemeral });
    }

    await interaction.reply(`🧹 Soft banned **${target.user.tag}**. Reason: ${reason}`);
    const embed = createLogEmbed('danger', '🧹 Member soft banned')
      .setThumbnail(target.user.displayAvatarURL())
      .addFields(
        { name: 'User', value: userField(target.user) },
        { name: 'Moderator', value: userField(interaction.user) },
        { name: 'Reason', value: reason },
      );
    await sendLog(interaction.guild, embed);
  },
};
