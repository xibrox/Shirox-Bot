const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Show information about this server')
    .setDMPermission(false),

  async execute(interaction) {
    const guild = interaction.guild;
    const owner = await guild.fetchOwner().catch(() => null);
    const channels = guild.channels.cache;

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL({ size: 256 }))
      .addFields(
        { name: 'Owner', value: owner ? `${owner.user.tag}` : 'Unknown', inline: true },
        { name: 'Members', value: `${guild.memberCount}`, inline: true },
        { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
        {
          name: 'Channels',
          value: `💬 ${channels.filter(c => c.type === ChannelType.GuildText).size} text · 🔊 ${channels.filter(c => c.type === ChannelType.GuildVoice).size} voice`,
          inline: true,
        },
        { name: 'Roles', value: `${guild.roles.cache.size - 1}`, inline: true },
        { name: 'Boosts', value: `${guild.premiumSubscriptionCount ?? 0} (Tier ${guild.premiumTier})`, inline: true },
      )
      .setFooter({ text: `ID: ${guild.id}` });

    await interaction.reply({ embeds: [embed] });
  },
};
