const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user')
    .addStringOption(option => option.setName('user_id').setDescription('ID of the user to unban').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for the unban').setMaxLength(400))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const userId = interaction.options.getString('user_id').trim();
    const reason = interaction.options.getString('reason') || 'No reason provided';
    if (!/^\d{17,20}$/.test(userId)) {
      return interaction.reply({ content: '❌ That is not a valid user ID.', ephemeral: true });
    }

    try {
      const user = await interaction.guild.members.unban(userId, `${interaction.user.tag}: ${reason}`);
      await interaction.reply(`✅ Unbanned **${user?.tag ?? userId}**.`);
    } catch {
      await interaction.reply({ content: "❌ Couldn't unban that user. They may not be banned.", ephemeral: true });
    }
  },
};
