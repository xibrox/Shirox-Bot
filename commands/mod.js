const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { VIEWS } = require('../lib/mod/views');
const { homeView } = require('../lib/mod/views/home');
const { OUT_OF_DATE, can, permissionReply } = require('../lib/mod/ui');
const { guardSlowReply } = require('../lib/slowReply');

// Buttons, menus and forms use "mod:<view>:<action>[:<arg>]"
async function route(interaction, kind) {
  const [, viewId, action, arg] = interaction.customId.split(':');
  const view = VIEWS[viewId];
  const handler = kind === 'modal' ? view?.handleModal : view?.handleComponent;
  if (!handler || !view.actions || !Object.hasOwn(view.actions, action)) return interaction.reply(OUT_OF_DATE);
  // The panel is private, but permissions can change while it's open
  const permission = view.actions[action];
  if (permission && !can(interaction, permission)) return interaction.reply(permissionReply(permission));
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
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Open the moderation panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.reply({ ...(await homeView(interaction)), flags: MessageFlags.Ephemeral });
  },

  handleComponent(interaction) {
    return route(interaction, 'component');
  },

  handleModal(interaction) {
    return route(interaction, 'modal');
  },
};
