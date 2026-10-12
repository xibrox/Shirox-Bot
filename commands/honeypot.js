const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const { COLORS } = require('../lib/colors');
const { getGuildConfig, updateGuildConfig } = require('../lib/guildConfig');

const ACTION_LABELS = {
  softban: 'Soft ban (ban + instant unban, deletes their last 24h of messages)',
  ban: 'Ban (deletes their last 24h of messages)',
  kick: 'Kick',
};

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
      const me = interaction.guild.members.me;

      const needed = action === 'kick' ? PermissionFlagsBits.KickMembers : PermissionFlagsBits.BanMembers;
      if (!me.permissions.has(needed)) {
        return interaction.reply({ content: `❌ I need the **${action === 'kick' ? 'Kick' : 'Ban'} Members** permission for this.`, ephemeral: true });
      }
      if (!channel.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageMessages])) {
        return interaction.reply({ content: `❌ I need View Channel and Manage Messages in ${channel}.`, ephemeral: true });
      }

      updateGuildConfig(interaction.guild.id, { honeypotChannelId: channel.id, honeypotAction: action });

      if (postWarning) {
        const embed = new EmbedBuilder()
          .setColor(COLORS.danger)
          .setTitle('⚠️ DO NOT SEND MESSAGES IN THIS CHANNEL')
          .setDescription(
            'This channel is a trap for hacked accounts and spam bots.\n\n' +
            `Anyone who posts here is **automatically ${action === 'kick' ? 'kicked' : action === 'ban' ? 'banned' : 'removed from the server and has their recent messages deleted'}**.`,
          );
        await channel.send({ embeds: [embed] }).catch(() => {});
      }

      return interaction.reply({
        content: `🍯 Honeypot active in ${channel}.\nAction: **${ACTION_LABELS[action]}**\nStaff with **Manage Messages** are ignored.\n` +
          `💡 Tip: put the channel near the top of the channel list — spam bots usually post in the first channels they can see.`,
        ephemeral: true,
      });
    }

    if (sub === 'disable') {
      updateGuildConfig(interaction.guild.id, { honeypotChannelId: null, honeypotAction: null });
      return interaction.reply({ content: '✅ Honeypot disabled.', ephemeral: true });
    }

    const config = getGuildConfig(interaction.guild.id);
    await interaction.reply({
      content: config.honeypotChannelId
        ? `🍯 Channel: <#${config.honeypotChannelId}>\nAction: **${ACTION_LABELS[config.honeypotAction || 'softban']}**`
        : 'The honeypot is *disabled*.',
      ephemeral: true,
    });
  },
};
