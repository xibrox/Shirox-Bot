const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { COLORS } = require('../lib/colors');
const { getWarnings, removeWarning, clearWarnings } = require('../lib/warnings');

module.exports = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription("View or manage a member's warnings")
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription("List a member's warnings")
        .addUserOption(option => option.setName('user').setDescription('Member').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove one warning')
        .addUserOption(option => option.setName('user').setDescription('Member').setRequired(true))
        .addIntegerOption(option => option.setName('id').setDescription('Warning number (see /warnings list)').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('clear')
        .setDescription('Remove all warnings from a member')
        .addUserOption(option => option.setName('user').setDescription('Member').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser('user');
    const guildId = interaction.guild.id;

    if (sub === 'remove') {
      const id = interaction.options.getInteger('id');
      const removed = removeWarning(guildId, user.id, id);
      return interaction.reply({
        content: removed ? `✅ Removed warning #${id} from **${user.tag}**.` : `❌ **${user.tag}** has no warning #${id}.`,
        ephemeral: true,
      });
    }

    if (sub === 'clear') {
      const count = clearWarnings(guildId, user.id);
      return interaction.reply({ content: `✅ Cleared **${count}** warning(s) from **${user.tag}**.`, ephemeral: true });
    }

    const warnings = getWarnings(guildId, user.id);
    if (warnings.length === 0) {
      return interaction.reply({ content: `✅ **${user.tag}** has no warnings.`, ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.warning)
      .setTitle(`⚠️ Warnings for ${user.tag} (${warnings.length})`)
      .setThumbnail(user.displayAvatarURL())
      .setDescription(warnings.slice(-15).map(w =>
        `**#${w.id}** · <t:${Math.floor(w.timestamp / 1000)}:R> by <@${w.moderatorId}>\n${w.reason}`,
      ).join('\n\n'));
    if (warnings.length > 15) embed.setFooter({ text: `Showing the latest 15 of ${warnings.length}` });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
