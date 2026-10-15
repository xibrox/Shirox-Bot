const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { ACTION_LABELS, honeypotError, honeypotWarningEmbed } = require('../lib/honeypot');
const { getGuildConfig, updateGuildConfig } = require('../lib/guildConfig');

module.exports = {
  category: 'setup',
  data: new SlashCommandBuilder()
    .setName('honeypot')
    .setDescription('Trap channel that catches hacked/spam accounts posting in it')
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Turn a channel into a honeypot')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('The trap channel (ideally a new, otherwise unused one)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true))
        .addStringOption(option =>
          option.setName('action')
            .setDescription('What to do to anyone who posts there (default: soft ban)')
            .addChoices(
              { name: 'Soft ban (removes them + their messages, they can rejoin)', value: 'softban' },
              { name: 'Ban', value: 'ban' },
              { name: 'Kick (does not delete messages)', value: 'kick' },
            ))
        .addBooleanOption(option =>
          option.setName('post_warning')
            .setDescription('Post a "do not type here" warning in the channel (default: true)')))
    .addSubcommand(sub =>
      sub.setName('disable')
        .setDescription('Turn off the honeypot'))
    .addSubcommand(sub =>
      sub.setName('show')
        .setDescription('Show the current honeypot settings'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel');
      const action = interaction.options.getString('action') || 'softban';
      const postWarning = interaction.options.getBoolean('post_warning') ?? true;
      const error = honeypotError(interaction.guild, channel, action);
      if (error) return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });

      updateGuildConfig(interaction.guild.id, { honeypotChannelId: channel.id, honeypotAction: action });
      if (postWarning) await channel.send({ embeds: [honeypotWarningEmbed(action)] }).catch(() => {});

      return interaction.reply({
        content: `🍯 Honeypot active in ${channel}.\nAction: **${ACTION_LABELS[action]}**\nStaff with **Manage Messages** are ignored.\n` +
          `💡 Tip: put the channel near the top of the channel list — spam bots usually post in the first channels they can see.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'disable') {
      updateGuildConfig(interaction.guild.id, { honeypotChannelId: null, honeypotAction: null });
      return interaction.reply({ content: '✅ Honeypot disabled.', flags: MessageFlags.Ephemeral });
    }

    const config = getGuildConfig(interaction.guild.id);
    await interaction.reply({
      content: config.honeypotChannelId
        ? `🍯 Channel: <#${config.honeypotChannelId}>\nAction: **${ACTION_LABELS[config.honeypotAction || 'softban']}**`
        : 'The honeypot is *disabled*.',
      flags: MessageFlags.Ephemeral,
    });
  },
};
