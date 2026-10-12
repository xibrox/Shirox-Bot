const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, OAuth2Scopes, PermissionFlagsBits } = require('discord.js');
const { EMBED_COLOR } = require('../lib/colors');

// Everything the bot's features need (moderation, logging, honeypot, roles, welcome...)
const REQUIRED_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageNicknames,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ViewAuditLog,
  PermissionFlagsBits.CreateInstantInvite,
];

module.exports = {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Get the link to add this bot to your own server'),

  async execute(interaction) {
    const url = interaction.client.generateInvite({
      scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
      permissions: REQUIRED_PERMISSIONS,
    });

    const buttons = [new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Add to server').setURL(url)];
    if (process.env.SUPPORT_SERVER_URL) {
      buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Support server').setURL(process.env.SUPPORT_SERVER_URL));
    }

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(`➕ Invite ${interaction.client.user.username}`)
      .setThumbnail(interaction.client.user.displayAvatarURL())
      .setDescription('Click the button below to add the bot to a server you manage. It asks only for the permissions its features need.');
    await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(buttons)] });
  },
};
