const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { getGuildConfig, updateGuildConfig } = require('../lib/guildConfig');

const { PLACEHOLDERS } = require('../lib/greetings');

module.exports = {
  category: 'setup',
  data: new SlashCommandBuilder()
    .setName('goodbye')
    .setDescription('Configure goodbye messages when members leave')
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Set the goodbye channel and message')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel to send goodbye messages in')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true))
        .addStringOption(option =>
          option.setName('message')
            .setDescription('Placeholders: {user} {username} {server} {count}')
            .setMaxLength(1000)))
    .addSubcommand(sub =>
      sub.setName('disable')
        .setDescription('Turn off goodbye messages'))
    .addSubcommand(sub =>
      sub.setName('show')
        .setDescription('Show the current goodbye settings'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel');
      const message = interaction.options.getString('message');
      const perms = channel.permissionsFor(interaction.guild.members.me);
      if (!perms.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        return interaction.reply({ content: `❌ I need View Channel, Send Messages and Embed Links in ${channel}.`, flags: MessageFlags.Ephemeral });
      }

      updateGuildConfig(interaction.guild.id, { goodbyeChannelId: channel.id, goodbyeMessage: message });
      return interaction.reply({
        content: `✅ Goodbye messages will be sent in ${channel}.\nPlaceholders: ${PLACEHOLDERS}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'disable') {
      updateGuildConfig(interaction.guild.id, { goodbyeChannelId: null, goodbyeMessage: null });
      return interaction.reply({ content: '✅ Goodbye messages disabled.', flags: MessageFlags.Ephemeral });
    }

    const config = getGuildConfig(interaction.guild.id);
    if (!config.goodbyeChannelId) {
      return interaction.reply({ content: 'Goodbye messages are *disabled*.', flags: MessageFlags.Ephemeral });
    }
    await interaction.reply({
      content: `📢 Channel: <#${config.goodbyeChannelId}>\n💬 Message: ${config.goodbyeMessage || '*default*'}`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
