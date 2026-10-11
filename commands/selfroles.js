const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EMBED_COLOR } = require('../lib/colors');
const { checkAssignableRole } = require('../lib/moderation');

const MAX_ROLES = 10;

const data = new SlashCommandBuilder()
  .setName('selfroles')
  .setDescription('Post a panel of buttons members can click to give themselves roles')
  .addStringOption(option => option.setName('title').setDescription('Panel title').setMaxLength(200).setRequired(true))
  .addRoleOption(option => option.setName('role1').setDescription('Role 1').setRequired(true));
for (let i = 2; i <= MAX_ROLES; i++) {
  data.addRoleOption(option => option.setName(`role${i}`).setDescription(`Role ${i}`));
}
data
  .addStringOption(option => option.setName('description').setDescription('Text shown above the buttons').setMaxLength(1000))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .setDMPermission(false);

module.exports = {
  data,

  async execute(interaction) {
    const roles = [];
    for (let i = 1; i <= MAX_ROLES; i++) {
      const role = interaction.options.getRole(`role${i}`);
      if (role && !roles.some(r => r.id === role.id)) roles.push(role);
    }

    for (const role of roles) {
      const error = checkAssignableRole(interaction, role);
      if (error) return interaction.reply({ content: error, ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(interaction.options.getString('title'))
      .setDescription(
        (interaction.options.getString('description') || 'Click a button to get or remove a role.') +
        '\n\n' + roles.map(r => `• ${r}`).join('\n'),
      );

    const buttons = roles.map(role =>
      new ButtonBuilder()
        .setCustomId(`selfrole:${role.id}`)
        .setLabel(role.name.slice(0, 80))
        .setStyle(ButtonStyle.Secondary));
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
      rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }

    try {
      await interaction.channel.send({ embeds: [embed], components: rows });
      await interaction.reply({ content: '✅ Self-role panel posted.', ephemeral: true });
    } catch {
      await interaction.reply({ content: "❌ I couldn't post in this channel.", ephemeral: true });
    }
  },

  // Handles clicks on the panel's buttons (customId "selfrole:<roleId>")
  async handleButton(interaction) {
    const roleId = interaction.customId.split(':')[1];
    const role = interaction.guild.roles.cache.get(roleId);
    if (!role) return interaction.reply({ content: '❌ That role no longer exists.', ephemeral: true });
    if (role.position >= interaction.guild.members.me.roles.highest.position || role.managed) {
      return interaction.reply({ content: "❌ I can't manage that role anymore. Ask a staff member.", ephemeral: true });
    }

    const member = interaction.member;
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(role, 'Self role');
      await interaction.reply({ content: `➖ Removed ${role}.`, ephemeral: true });
    } else {
      await member.roles.add(role, 'Self role');
      await interaction.reply({ content: `➕ Added ${role}.`, ephemeral: true });
    }
  },
};
