const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { getGuildConfig, updateGuildConfig } = require('../lib/guildConfig');
const { DEFAULT_WELCOME, PLACEHOLDERS, buildGreetingEmbed } = require('../lib/greetings');
const { saveDraft, getDraft, dropDraft, previewButtons, closePreview, EXPIRED } = require('../lib/preview');
const { missingChannelPermissions, SEND_EMBED_PERMISSIONS } = require('../lib/channelChecks');

module.exports = {
  category: 'setup',
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
      const error = missingChannelPermissions(channel, interaction.guild.members.me, SEND_EMBED_PERMISSIONS);
      if (error) return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });

      // Preview it with the person running the command standing in for the member
      const id = saveDraft({ channelId: channel.id, message });
      return interaction.reply({
        content: `**Preview** of the welcome message for ${channel}. Save it?`,
        embeds: [buildGreetingEmbed(interaction.member, message || DEFAULT_WELCOME, true, getGuildConfig(interaction.guild.id).welcomeTitle)],
        components: [previewButtons('welcome', id, { confirm: 'Save', edit: false })],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'disable') {
      updateGuildConfig(interaction.guild.id, { welcomeChannelId: null, welcomeMessage: null, welcomeTitle: null, welcomeOff: null });
      return interaction.reply({ content: '✅ Welcome messages disabled.', flags: MessageFlags.Ephemeral });
    }

    const config = getGuildConfig(interaction.guild.id);
    if (!config.welcomeChannelId) {
      return interaction.reply({ content: 'Welcome messages are *disabled*.', flags: MessageFlags.Ephemeral });
    }
    await interaction.reply({
      content: `📢 Channel: <#${config.welcomeChannelId}>\n💬 Message: ${config.welcomeMessage || '*default*'}${config.welcomeOff ? '\n⏸️ Paused' : ''}`,
      flags: MessageFlags.Ephemeral,
    });
  },

  // Save / Cancel under the preview from /welcome set
  async handleComponent(interaction) {
    const [, action, id] = interaction.customId.split(':');
    const draft = getDraft(id);
    if (!draft) return interaction.update(EXPIRED);
    dropDraft(id);
    if (action === 'cancel') return interaction.update(closePreview('Cancelled, nothing was changed.'));

    updateGuildConfig(interaction.guild.id, { welcomeChannelId: draft.channelId, welcomeMessage: draft.message, welcomeOff: null });
    await interaction.update(closePreview(`✅ Welcome messages will be sent in <#${draft.channelId}>.\nPlaceholders: ${PLACEHOLDERS}`));
  },
};
