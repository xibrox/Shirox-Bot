const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { buildSelfRolePanel } = require('../lib/selfRoles');
const { savePanel } = require('../lib/selfRolePanels');
const { checkAssignableRole } = require('../lib/moderation');

// Slash commands allow 25 options in total, so /selfroles keeps 10 role slots (the dashboard allows 25)
const SLASH_ROLE_OPTIONS = 10;

const data = new SlashCommandBuilder()
  .setName('selfroles')
  .setDescription('Post a panel of buttons members can click to give themselves roles')
  .addStringOption(option => option.setName('title').setDescription('Panel title').setMaxLength(200).setRequired(true))
  .addRoleOption(option => option.setName('role1').setDescription('Role 1').setRequired(true));
for (let i = 2; i <= SLASH_ROLE_OPTIONS; i++) {
  data.addRoleOption(option => option.setName(`role${i}`).setDescription(`Role ${i}`));
}
data
  .addStringOption(option => option.setName('description').setDescription('Text shown above the buttons').setMaxLength(1000))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .setDMPermission(false);

module.exports = {
  category: 'setup',
  data,

  async execute(interaction) {
    const roles = [];
    for (let i = 1; i <= SLASH_ROLE_OPTIONS; i++) {
      const role = interaction.options.getRole(`role${i}`);
      if (role && !roles.some(r => r.id === role.id)) roles.push(role);
    }

    for (const role of roles) {
      const error = checkAssignableRole(interaction, role);
      if (error) return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });
    }

    const panel = buildSelfRolePanel(interaction.options.getString('title'), interaction.options.getString('description'), roles);

    try {
      const message = await interaction.channel.send(panel);
      savePanel(interaction.guild.id, {
        messageId: message.id,
        channelId: message.channelId,
        title: interaction.options.getString('title'),
        description: interaction.options.getString('description'),
        roleIds: roles.map(r => r.id),
      });
      await interaction.reply({ content: '✅ Self-role panel posted.', flags: MessageFlags.Ephemeral });
    } catch {
      await interaction.reply({ content: "❌ I couldn't post in this channel.", flags: MessageFlags.Ephemeral });
    }
  },

  // Handles clicks on the panel's buttons (customId "selfrole:<roleId>")
  async handleComponent(interaction) {
    const roleId = interaction.customId.split(':')[1];
    const role = interaction.guild.roles.cache.get(roleId);
    if (!role) return interaction.reply({ content: '❌ That role no longer exists.', flags: MessageFlags.Ephemeral });
    if (role.position >= interaction.guild.members.me.roles.highest.position || role.managed) {
      return interaction.reply({ content: "❌ I can't manage that role anymore. Ask a staff member.", flags: MessageFlags.Ephemeral });
    }

    // Role changes can take longer than Discord's 3 second reply window, so answer first
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const member = interaction.member;
    try {
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(role, 'Self role');
        await interaction.editReply(`➖ Removed ${role}.`);
      } else {
        await member.roles.add(role, 'Self role');
        await interaction.editReply(`➕ Added ${role}.`);
      }
    } catch {
      await interaction.editReply(`❌ I couldn't change ${role}. Ask a staff member.`);
    }
  },
};
