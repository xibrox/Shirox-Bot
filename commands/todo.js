const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags,
  ModalBuilder, LabelBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder,
} = require('discord.js');
const { updateGuildConfig } = require('../lib/guildConfig');
const {
  TYPES, guessType, splitText, readSource, postTodo, readCard, setType, setStatus, cardComponents,
} = require('../lib/todo');

const typeChoices = Object.entries(TYPES).map(([value, t]) => ({ name: `${t.emoji} ${t.label}`, value }));

// Form for a todo item: type dropdown, title and details
function todoModal(customId, title, { type, title: itemTitle, details } = {}) {
  const typeSelect = new StringSelectMenuBuilder()
    .setCustomId('type')
    .addOptions(Object.entries(TYPES).map(([value, t]) => ({ label: t.label, emoji: t.emoji, value, default: value === type })));
  const titleInput = new TextInputBuilder().setCustomId('title').setStyle(TextInputStyle.Short).setMaxLength(256).setRequired(true);
  const detailsInput = new TextInputBuilder().setCustomId('details').setStyle(TextInputStyle.Paragraph).setMaxLength(4000).setRequired(false);
  if (itemTitle) titleInput.setValue(itemTitle.slice(0, 256));
  if (details) detailsInput.setValue(details.slice(0, 4000));

  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  if (type) modal.addLabelComponents(new LabelBuilder().setLabel('Type').setStringSelectMenuComponent(typeSelect));
  return modal.addLabelComponents(
    new LabelBuilder().setLabel('Title').setTextInputComponent(titleInput),
    new LabelBuilder().setLabel('Details').setTextInputComponent(detailsInput),
  );
}

// Right-click → Apps → Add to todo (ctx-todo.js) opens this, prefilled from the message
async function openMessageModal(interaction, message) {
  const { content } = await readSource(message);
  const { title, details } = splitText(content || 'Untitled');
  await interaction.showModal(todoModal(`todo:message:${message.channelId}:${message.id}`, 'Add to todo', {
    type: guessType(content), title, details,
  }));
}

const posted = message => `✅ Added to todo: [${message.embeds[0].author.name}](${message.url})`;

module.exports = {
  category: 'moderation',
  openMessageModal,
  data: new SlashCommandBuilder()
    .setName('todo')
    .setDescription('Track bugs, problems and suggestions in a todo channel')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a todo item')
        .addStringOption(option => option.setName('title').setDescription('Short summary').setMaxLength(256).setRequired(true))
        .addStringOption(option => option.setName('type').setDescription('Guessed from the title if not set').addChoices(...typeChoices))
        .addStringOption(option => option.setName('details').setDescription('More info').setMaxLength(4000))
        .addUserOption(option => option.setName('reporter').setDescription('Who reported it')))
    .addSubcommand(sub =>
      sub.setName('channel')
        .setDescription('Set the todo channel. Messages and forwards posted there become todo cards.')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel for todo items')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    if (interaction.options.getSubcommand() === 'channel') {
      const channel = interaction.options.getChannel('channel');
      if (!channel.permissionsFor(interaction.guild.members.me).has([
        PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageMessages,
      ])) {
        return interaction.reply({
          content: `❌ I need View Channel, Send Messages, Embed Links, Attach Files and Manage Messages in ${channel}.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      updateGuildConfig(interaction.guild.id, { todoChannelId: channel.id });
      return interaction.reply({
        content: `✅ Todo channel set to ${channel}.\n`
          + 'Anything staff post or forward there turns into a todo card. Start with `bug:`, `suggestion:`, `problem:` or `task:` to pick the type, '
          + 'or start with `//` to leave a normal message.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const title = interaction.options.getString('title');
    const details = interaction.options.getString('details');
    try {
      const message = await postTodo(interaction.guild, {
        type: interaction.options.getString('type') ?? guessType(`${title}\n${details ?? ''}`),
        title,
        details,
        reporter: interaction.options.getUser('reporter'),
        addedBy: interaction.user,
      });
      await interaction.reply({ content: posted(message), flags: MessageFlags.Ephemeral });
    } catch (err) {
      await interaction.reply({ content: `❌ ${err.message}`, flags: MessageFlags.Ephemeral });
    }
  },

  // Buttons and type dropdown on a todo card
  async handleComponent(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ Only staff with Manage Server can update todo items.', flags: MessageFlags.Ephemeral });
    }
    const [, action, value] = interaction.customId.split(':');
    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
    const card = readCard(interaction.message.embeds[0]);

    if (action === 'editcard') {
      return interaction.showModal(todoModal('todo:card', `Edit todo #${card.number}`, {
        title: embed.data.title, details: embed.data.description,
      }));
    }
    if (action === 'type') card.type = interaction.values[0];
    if (action === 'status') card.status = value;

    setType(embed, card.type, card.number);
    if (action === 'status') setStatus(embed, card.status, interaction.user);
    await interaction.update({ embeds: [embed], components: cardComponents(card.type, card.status) });
  },

  // "todo:message:<channelId>:<messageId>" from the right-click app, "todo:card" from a card's Edit button
  async handleModal(interaction) {
    const [, action, channelId, messageId] = interaction.customId.split(':');
    const title = interaction.fields.getTextInputValue('title').trim();
    const details = interaction.fields.getTextInputValue('details').trim();

    if (action === 'card') {
      const embed = EmbedBuilder.from(interaction.message.embeds[0]).setTitle(title).setDescription(details || null);
      return interaction.update({ embeds: [embed] });
    }

    const message = await interaction.client.channels.fetch(channelId)
      .then(channel => channel.messages.fetch(messageId))
      .catch(() => null);
    if (!message) return interaction.reply({ content: "❌ I couldn't find that message anymore.", flags: MessageFlags.Ephemeral });

    const source = await readSource(message);
    try {
      const card = await postTodo(interaction.guild, {
        type: interaction.fields.getStringSelectValues('type')[0],
        title,
        details,
        reporter: source.reporter,
        sourceUrl: source.sourceUrl,
        attachments: source.attachments,
        addedBy: interaction.user,
      });
      await interaction.reply({ content: posted(card), flags: MessageFlags.Ephemeral });
    } catch (err) {
      await interaction.reply({ content: `❌ ${err.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
