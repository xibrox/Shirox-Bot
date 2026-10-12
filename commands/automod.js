const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildConfig, updateGuildConfig } = require('../lib/guildConfig');

module.exports = {
  category: 'setup',
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Automatic moderation (staff with Manage Messages are ignored)')
    .addSubcommand(sub =>
      sub.setName('invites')
        .setDescription('Delete Discord invite links from other servers')
        .addBooleanOption(option => option.setName('enabled').setDescription('On or off').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('links')
        .setDescription('Delete all links')
        .addBooleanOption(option => option.setName('enabled').setDescription('On or off').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('mentions')
        .setDescription('Delete messages that mention too many users/roles and timeout the sender for 10m')
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Max mentions per message (0 = off)')
            .setMinValue(0)
            .setMaxValue(50)
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('spam')
        .setDescription('Timeout members who send 5+ messages within 5 seconds')
        .addBooleanOption(option => option.setName('enabled').setDescription('On or off').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('new_accounts')
        .setDescription('Kick accounts younger than a number of days when they join')
        .addIntegerOption(option =>
          option.setName('days')
            .setDescription('Minimum account age in days (0 = off)')
            .setMinValue(0)
            .setMaxValue(365)
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('show')
        .setDescription('Show the current automod settings'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const onOff = value => (value ? '✅ on' : '❌ off');

    if (sub === 'invites' || sub === 'links' || sub === 'spam') {
      const enabled = interaction.options.getBoolean('enabled');
      const key = { invites: 'automodInvites', links: 'automodLinks', spam: 'automodSpam' }[sub];
      updateGuildConfig(guildId, { [key]: enabled || null });
      return interaction.reply({ content: `🛡️ ${sub} filter: ${onOff(enabled)}`, ephemeral: true });
    }

    if (sub === 'mentions') {
      const limit = interaction.options.getInteger('limit');
      updateGuildConfig(guildId, { automodMentionLimit: limit || null });
      return interaction.reply({ content: limit ? `🛡️ Max mentions per message: **${limit}**` : '🛡️ Mention filter: ❌ off', ephemeral: true });
    }

    if (sub === 'new_accounts') {
      const days = interaction.options.getInteger('days');
      if (days && !interaction.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) {
        return interaction.reply({ content: '❌ I need the **Kick Members** permission for this.', ephemeral: true });
      }
      updateGuildConfig(guildId, { automodMinAccountAgeDays: days || null });
      return interaction.reply({
        content: days ? `🛡️ Accounts younger than **${days} day(s)** will be kicked on join.` : '🛡️ New account filter: ❌ off',
        ephemeral: true,
      });
    }

    const c = getGuildConfig(guildId);
    await interaction.reply({
      content: [
        `🔗 Invite links: ${onOff(c.automodInvites)}`,
        `🌐 All links: ${onOff(c.automodLinks)}`,
        `📣 Mention limit: ${c.automodMentionLimit ? `**${c.automodMentionLimit}**` : '❌ off'}`,
        `💬 Spam: ${onOff(c.automodSpam)}`,
        `🆕 Min account age: ${c.automodMinAccountAgeDays ? `**${c.automodMinAccountAgeDays} day(s)**` : '❌ off'}`,
      ].join('\n'),
      ephemeral: true,
    });
  },
};
