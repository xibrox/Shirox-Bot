const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { getGuildConfig, updateGuildConfig } = require('../lib/guildConfig');

module.exports = {
  category: 'setup',
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Log server activity (messages, members, moderation, voice) to a channel')
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Set the log channel')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel to send logs to')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('disable')
        .setDescription('Turn off logging'))
    .addSubcommand(sub =>
      sub.setName('show')
        .setDescription('Show the current log channel'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel');
      const me = interaction.guild.members.me;
      if (!channel.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        return interaction.reply({ content: `❌ I need View Channel, Send Messages and Embed Links in ${channel}.`, flags: MessageFlags.Ephemeral });
      }

      updateGuildConfig(interaction.guild.id, { logChannelId: channel.id });
      const auditNote = me.permissions.has(PermissionFlagsBits.ViewAuditLog)
        ? ''
        : '\n⚠️ Give me **View Audit Log** so logs can show who banned/kicked/timed out someone.';
      return interaction.reply({ content: `✅ Logs will be sent to ${channel}.${auditNote}`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'disable') {
      updateGuildConfig(interaction.guild.id, { logChannelId: null });
      return interaction.reply({ content: '✅ Logging disabled.', flags: MessageFlags.Ephemeral });
    }

    const { logChannelId } = getGuildConfig(interaction.guild.id);
    await interaction.reply({
      content: logChannelId ? `📜 Logs are sent to <#${logChannelId}>.` : 'Logging is *disabled*.',
      flags: MessageFlags.Ephemeral,
    });
  },
};
