const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EMBED_COLOR } = require('../lib/colors');

// Builds the reply for /avatar, /pfp and the "Avatar" right-click app
async function buildAvatarReply(user, member, type = 'avatar') {
  let url;
  let label = 'avatar';
  if (type === 'banner') {
    const fetched = await user.fetch(true);
    url = fetched.bannerURL({ size: 1024 });
    label = 'banner';
    if (!url) return { content: `❌ **${user.username}** has no banner.`, ephemeral: true };
  } else if (type === 'server' && member?.avatar) {
    url = member.displayAvatarURL({ size: 1024 });
    label = 'server avatar';
  } else {
    url = user.displayAvatarURL({ size: 1024 });
  }

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`${user.username}'s ${label}`)
    .setImage(url);
  const formats = ['png', 'jpg', 'webp'].map(ext =>
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(ext.toUpperCase()).setURL(url.replace(/\.(png|jpg|webp|gif)/, `.${ext}`)));
  if (url.includes('.gif')) formats.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('GIF').setURL(url));
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(formats)] };
}

function buildCommand(name, description) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .addUserOption(option => option.setName('user').setDescription('User (defaults to you)'))
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Which picture to show')
        .addChoices(
          { name: 'Avatar', value: 'avatar' },
          { name: 'Server avatar', value: 'server' },
          { name: 'Banner', value: 'banner' },
        ));
}

async function execute(interaction) {
  const user = interaction.options.getUser('user') || interaction.user;
  const member = interaction.options.getMember('user') || (user.id === interaction.user.id ? interaction.member : null);
  await interaction.reply(await buildAvatarReply(user, member, interaction.options.getString('type') || 'avatar'));
}

module.exports = {
  category: 'utility',
  buildAvatarReply,
  buildCommand,
  data: buildCommand('avatar', "Show a user's avatar, server avatar or banner"),
  execute,
};
