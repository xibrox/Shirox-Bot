const { SlashCommandBuilder, EmbedBuilder, UserFlags } = require('discord.js');
const { EMBED_COLOR } = require('../lib/colors');
const { getWarnings } = require('../lib/warnings');

const BADGES = {
  Staff: '👨‍💼 Discord Staff',
  Partner: '🤝 Partner',
  Hypesquad: '🎉 HypeSquad Events',
  HypeSquadOnlineHouse1: '🏠 Bravery',
  HypeSquadOnlineHouse2: '🏠 Brilliance',
  HypeSquadOnlineHouse3: '🏠 Balance',
  PremiumEarlySupporter: '💎 Early Supporter',
  BugHunterLevel1: '🐛 Bug Hunter',
  BugHunterLevel2: '🐛 Bug Hunter Gold',
  VerifiedDeveloper: '🛠️ Early Verified Bot Developer',
  ActiveDeveloper: '🛠️ Active Developer',
  VerifiedBot: '✅ Verified Bot',
};

const ts = (ms, style = 'R') => `<t:${Math.floor(ms / 1000)}:${style}>`;

// Builds the /userinfo embed; also used by the "User Info" right-click app
async function buildUserInfoEmbed(interaction, user, member) {
  const fetched = await user.fetch(true).catch(() => user);
  const badges = (fetched.flags?.toArray() || []).map(flag => BADGES[flag]).filter(Boolean);
  const color = member?.displayHexColor && member.displayHexColor !== '#000000' ? member.displayHexColor : EMBED_COLOR;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
    .setThumbnail((member || user).displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'ID', value: `\`${user.id}\``, inline: true },
      { name: 'Mention', value: `${user}`, inline: true },
      { name: 'Bot', value: user.bot ? 'Yes' : 'No', inline: true },
      { name: 'Account created', value: `${ts(user.createdTimestamp, 'D')} (${ts(user.createdTimestamp)})` },
    );
  if (badges.length) embed.addFields({ name: 'Badges', value: badges.join('\n') });

  if (member) {
    const roles = member.roles.cache
      .filter(r => r.id !== interaction.guild.id)
      .sort((a, b) => b.position - a.position)
      .map(r => `${r}`);
    embed.addFields(
      { name: 'Joined server', value: `${ts(member.joinedTimestamp, 'D')} (${ts(member.joinedTimestamp)})` },
      { name: 'Nickname', value: member.nickname || 'None', inline: true },
      { name: 'Boosting since', value: member.premiumSince ? ts(member.premiumSinceTimestamp) : 'Not boosting', inline: true },
    );
    if (member.isCommunicationDisabled()) {
      embed.addFields({ name: 'Timed out until', value: ts(member.communicationDisabledUntilTimestamp, 'F') });
    }
    embed.addFields({
      name: `Roles (${roles.length})`,
      value: roles.length ? roles.slice(0, 20).join(' ') + (roles.length > 20 ? ` +${roles.length - 20} more` : '') : 'None',
    });

    // Staff can see a member's warning count at a glance
    if (interaction.memberPermissions?.has('ModerateMembers')) {
      embed.addFields({ name: 'Warnings', value: `${getWarnings(interaction.guild.id, user.id).length}`, inline: true });
    }
  } else if (interaction.guild) {
    embed.setFooter({ text: 'Not a member of this server' });
  }

  const bannerURL = fetched.bannerURL?.({ size: 1024 });
  if (bannerURL) embed.setImage(bannerURL);
  return embed;
}

module.exports = {
  category: 'utility',
  buildUserInfoEmbed,
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show information about a user')
    .addUserOption(option => option.setName('user').setDescription('User to look up (defaults to you)'))
    .setDMPermission(false),

  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const member = interaction.options.getMember('user') || (user.id === interaction.user.id ? interaction.member : null);
    await interaction.reply({ embeds: [await buildUserInfoEmbed(interaction, user, member)] });
  },
};
