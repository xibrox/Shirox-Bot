const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { createPermanentInvite } = require('../lib/invites');

module.exports = {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('serverlink')
    .setDescription('Get a permanent invite link to this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.CreateInstantInvite)
    .setDMPermission(false),

  async execute(interaction) {
    const guild = interaction.guild;
    if (guild.vanityURLCode) {
      return interaction.reply(`🔗 **${guild.name}**: https://discord.gg/${guild.vanityURLCode}`);
    }

    // Prefer the rules/system channel so new members land somewhere sensible
    const invite = await createPermanentInvite(guild, {
      preferred: [guild.rulesChannel, guild.systemChannel, interaction.channel],
      reason: `Requested by ${interaction.user.tag}`,
    });
    if (!invite) {
      return interaction.reply({ content: '❌ I need the **Create Invite** permission to make a link.', flags: MessageFlags.Ephemeral });
    }

    await interaction.reply(`🔗 **${guild.name}**: ${invite.url}`);
  },
};
