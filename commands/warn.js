const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { addWarning } = require('../lib/warnings');
const { createLogEmbed, sendLog, userField } = require('../lib/logger');

module.exports = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member')
    .addUserOption(option => option.setName('user').setDescription('Member to warn').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for the warning').setMaxLength(400).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    if (user.bot) return interaction.reply({ content: "❌ You can't warn bots.", ephemeral: true });
    if (user.id === interaction.user.id) return interaction.reply({ content: "❌ You can't warn yourself.", ephemeral: true });

    const warnings = addWarning(interaction.guild.id, user.id, reason, interaction.user.id);
    const dmSent = await user.send(`⚠️ You were warned in **${interaction.guild.name}**. Reason: ${reason}`)
      .then(() => true, () => false);

    await interaction.reply(
      `⚠️ Warned **${user.tag}** (warning #${warnings.at(-1).id}, ${warnings.length} total). Reason: ${reason}` +
      (dmSent ? '' : "\n*(Couldn't DM them.)*"),
    );

    const embed = createLogEmbed('warning', '⚠️ Member warned')
      .addFields(
        { name: 'User', value: userField(user) },
        { name: 'Moderator', value: userField(interaction.user) },
        { name: 'Reason', value: reason },
        { name: 'Total warnings', value: `${warnings.length}`, inline: true },
      );
    await sendLog(interaction.guild, embed);
  },
};
