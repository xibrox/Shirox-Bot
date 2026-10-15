const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { EMBED_COLOR } = require('../lib/colors');
const { getGuildConfig } = require('../lib/guildConfig');
const { permissionNames, listText } = require('../lib/permissions');
const { SECTIONS } = require('../lib/setup/sections');
const { guardSlowReply } = require('../lib/slowReply');
const { hasAccess, isBlocked } = require('../lib/access');

const OUT_OF_DATE = { content: '⚠️ This dashboard is out of date. Run /setup again.', flags: MessageFlags.Ephemeral };

// Bot mods can open sections too (lib/access.js); `command` is what they can be blocked from
const canOpen = (section, interaction) =>
  !isBlocked(interaction, 'setup') && hasAccess(interaction, section.permission, section.command ?? 'setup');
const visibleSections = interaction => SECTIONS.filter(section => canOpen(section, interaction));

const permissionReply = section => ({
  content: `❌ You need **${listText(permissionNames(section.permission))}** for this.`,
  flags: MessageFlags.Ephemeral,
});

function homeView(interaction, notice) {
  const { guild } = interaction;
  const config = getGuildConfig(guild.id);
  const sections = visibleSections(interaction);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`⚙️ ${guild.name} setup`)
    .setThumbnail(guild.iconURL())
    .addFields(sections.map(s => ({ name: `${s.emoji} ${s.label}`, value: s.status(config, guild), inline: true })))
    .setFooter({ text: 'Only you can see this. Changes save immediately.' });
  const menu = new StringSelectMenuBuilder()
    .setCustomId('setup:home:open')
    .setPlaceholder('Open a section…')
    .addOptions(sections.map(s => ({ label: s.label, emoji: { name: s.emoji }, value: s.id })));
  return { content: notice ?? '', embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

// Buttons, menus and forms use "setup:<section>:<action>[:<arg>]"
async function route(interaction, kind) {
  const [, sectionId, action, arg] = interaction.customId.split(':');

  if (sectionId === 'home') {
    if (action === 'show') return interaction.update(homeView(interaction));
    if (action !== 'open') return interaction.reply(OUT_OF_DATE);
    const section = SECTIONS.find(s => s.id === interaction.values[0]);
    if (!section) return interaction.reply(OUT_OF_DATE);
    if (!canOpen(section, interaction)) return interaction.reply(permissionReply(section));
    return interaction.update(section.view(interaction));
  }

  const section = SECTIONS.find(s => s.id === sectionId);
  const handler = kind === 'modal' ? section?.handleModal : section?.handleComponent;
  if (!handler) return interaction.reply(OUT_OF_DATE);
  // The dashboard is private, but permissions can change while it's open
  if (!canOpen(section, interaction)) return interaction.reply(permissionReply(section));
  const done = guardSlowReply(interaction);
  try {
    await handler(interaction, action, arg);
  } finally {
    done();
  }
  // A handler that didn't recognise the action left the interaction unanswered
  if (!interaction.replied && !interaction.deferred) await interaction.reply(OUT_OF_DATE);
}

module.exports = {
  category: 'setup',
  homeView,
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Open the settings dashboard for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    if (!visibleSections(interaction).length) {
      return interaction.reply({ content: "❌ You don't have permission to change any settings.", flags: MessageFlags.Ephemeral });
    }
    await interaction.reply({ ...homeView(interaction), flags: MessageFlags.Ephemeral });
  },

  handleComponent(interaction) {
    return route(interaction, 'component');
  },

  handleModal(interaction) {
    return route(interaction, 'modal');
  },
};
