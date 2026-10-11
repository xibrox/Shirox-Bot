const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show information about a user')
    .addUserOption(option => option.setName('user').setDescription('User to look up (defaults to you)'))
    .setDMPermission(false),

  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const member = interaction.options.getMember('user') || (user.id === interaction.user.id ? interaction.member : null);

    const embed = new EmbedBuilder()
      .setColor(member?.displayHexColor && member.displayHexColor !== '#000000' ? member.displayHexColor : '#5865F2')
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'ID', value: user.id, inline: true },
        { name: 'Bot', value: user.bot ? 'Yes' : 'No', inline: true },
        { name: 'Account created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
      );

    if (member) {
      const roles = member.roles.cache
        .filter(r => r.id !== interaction.guild.id)
        .sort((a, b) => b.position - a.position)
        .map(r => `${r}`);
      embed.addFields(
        { name: 'Joined server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
        { name: 'Nickname', value: member.nickname || 'None', inline: true },
        {
          name: `Roles (${roles.length})`,
          value: roles.length ? roles.slice(0, 20).join(' ') + (roles.length > 20 ? ` +${roles.length - 20} more` : '') : 'None',
        },
      );
    }

    await interaction.reply({ embeds: [embed] });
  },
};
