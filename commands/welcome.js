const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { getGuildConfig, updateGuildConfig } = require('../lib/guildConfig');

const { PLACEHOLDERS } = require('../lib/greetings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Configure welcome messages for new members')
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Set the welcome channel and message')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel to send welcome messages in')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true))
        .addStringOption(option =>
          option.setName('message')
            .setDescription('Placeholders: {user} {username} {server} {count}')
            .setMaxLength(1000)))
    .addSubcommand(sub =>
      sub.setName('disable')
        .setDescription('Turn off welcome messages'))
    .addSubcommand(sub =>
      sub.setName('show')
        .setDescription('Show the current welcome settings'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel');
      const message = interaction.options.getString('message');
      const perms = channel.permissionsFor(interaction.guild.members.me);
      if (!perms.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        return interaction.reply({ content: `❌ I need View Channel, Send Messages and Embed Links in ${channel}.`, ephemeral: true });
      }

      updateGuildConfig(interaction.guild.id, { welcomeChannelId: channel.id, welcomeMessage: message });
      return interaction.reply({
        content: `✅ Welcome messages will be sent in ${channel}.\nPlaceholders: ${PLACEHOLDERS}`,
        ephemeral: true,
      });
    }

    if (sub === 'disable') {
      updateGuildConfig(interaction.guild.id, { welcomeChannelId: null, welcomeMessage: null });
      return interaction.reply({ content: '✅ Welcome messages disabled.', ephemeral: true });
    }

    const config = getGuildConfig(interaction.guild.id);
    if (!config.welcomeChannelId) {
      return interaction.reply({ content: 'Welcome messages are *disabled*.', ephemeral: true });
    }
    await interaction.reply({
      content: `📢 Channel: <#${config.welcomeChannelId}>\n💬 Message: ${config.welcomeMessage || '*default*'}`,
      ephemeral: true,
    });
  },
};
