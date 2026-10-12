const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

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
    const me = guild.members.me;
    const candidates = [guild.rulesChannel, guild.systemChannel, interaction.channel].filter(Boolean);
    const channel = candidates.find(c => c.permissionsFor(me)?.has(PermissionFlagsBits.CreateInstantInvite));
    if (!channel) {
      return interaction.reply({ content: '❌ I need the **Create Invite** permission to make a link.', ephemeral: true });
    }

    // unique: false reuses an existing identical permanent invite instead of making a new one each time
    const invite = await channel.createInvite({ maxAge: 0, maxUses: 0, unique: false, reason: `Requested by ${interaction.user.tag}` });
    await interaction.reply(`🔗 **${guild.name}**: ${invite.url}`);
  },
};
