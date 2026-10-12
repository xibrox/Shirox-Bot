const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock or unlock this channel for @everyone')
    .addBooleanOption(option =>
      option.setName('unlock')
        .setDescription('Unlock the channel instead'))
    .addStringOption(option => option.setName('reason').setDescription('Reason').setMaxLength(400))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),

  async execute(interaction) {
    const unlock = interaction.options.getBoolean('unlock') ?? false;
    const reason = interaction.options.getString('reason');
    const channel = interaction.channel;

    if (!channel.permissionOverwrites) {
      return interaction.reply({ content: "❌ This channel can't be locked.", flags: MessageFlags.Ephemeral });
    }

    try {
      // `null` resets to the category/server default rather than forcing "allow"
      await channel.permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        { SendMessages: unlock ? null : false, SendMessagesInThreads: unlock ? null : false },
        { reason: `${interaction.user.tag}: ${reason || (unlock ? 'Unlock' : 'Lock')}` },
      );
      await interaction.reply(
        unlock ? '🔓 Channel unlocked.' : `🔒 Channel locked.${reason ? ` Reason: ${reason}` : ''}`,
      );
    } catch {
      await interaction.reply({ content: "❌ I couldn't update this channel. Do I have **Manage Channels**?", flags: MessageFlags.Ephemeral });
    }
  },
};
