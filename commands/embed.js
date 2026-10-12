const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  MessageFlags,
} = require('discord.js');
const { EMBED_COLOR } = require('../lib/colors');

const MESSAGE_LINK = /channels\/\d+\/(\d+)\/(\d+)/;

function buildModal(customId, title, existing) {
  const field = (id, label, style, { value, required = false, max, placeholder } = {}) => {
    const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required);
    if (max) input.setMaxLength(max);
    if (placeholder) input.setPlaceholder(placeholder);
    if (value) input.setValue(value);
    return new ActionRowBuilder().addComponents(input);
  };
  const color = existing?.hexColor;

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(
      field('title', 'Title', TextInputStyle.Short, { value: existing?.title, max: 256 }),
      field('description', 'Description', TextInputStyle.Paragraph, { value: existing?.description, required: true, max: 4000 }),
      field('color', 'Color (hex)', TextInputStyle.Short, { value: color, max: 7, placeholder: '#FFFFFF' }),
      field('image', 'Image URL', TextInputStyle.Short, { value: existing?.image?.url, placeholder: 'https://...' }),
      field('footer', 'Footer', TextInputStyle.Short, { value: existing?.footer?.text, max: 2048 }),
    );
}

// Turns the submitted form into an embed, or returns an error message
function embedFromModal(interaction) {
  const get = id => interaction.fields.getTextInputValue(id).trim();
  const color = get('color') || EMBED_COLOR;
  const image = get('image');

  if (!/^#?[0-9a-f]{6}$/i.test(color)) return { error: '❌ Color must be a hex code like `#FFFFFF`.' };
  if (image && !/^https?:\/\/\S+$/i.test(image)) return { error: '❌ Image must be a link starting with `https://`.' };

  const embed = new EmbedBuilder()
    .setColor(color.startsWith('#') ? color : `#${color}`)
    .setDescription(get('description'));
  if (get('title')) embed.setTitle(get('title'));
  if (image) embed.setImage(image);
  if (get('footer')) embed.setFooter({ text: get('footer') });
  return { embed };
}

module.exports = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Create or edit a custom embed message')
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Create an embed (opens a form)')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Where to post it (defaults to this channel)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand(sub =>
      sub.setName('edit')
        .setDescription('Edit an embed I posted (opens a form)')
        .addStringOption(option =>
          option.setName('message')
            .setDescription('Message link, or message ID if it is in this channel')
            .setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),

  async execute(interaction) {
    if (interaction.options.getSubcommand() === 'create') {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      if (!interaction.member.permissionsIn(channel).has(PermissionFlagsBits.SendMessages)) {
        return interaction.reply({ content: `❌ You can't send messages in ${channel}.`, flags: MessageFlags.Ephemeral });
      }
      return interaction.showModal(buildModal(`embed:create:${channel.id}`, 'Create embed'));
    }

    const input = interaction.options.getString('message').trim();
    const [, channelId, messageId] = input.match(MESSAGE_LINK) || [null, interaction.channelId, input];
    const channel = interaction.guild.channels.cache.get(channelId);
    const message = await channel?.messages?.fetch(messageId).catch(() => null);

    if (!message) return interaction.reply({ content: "❌ I couldn't find that message.", flags: MessageFlags.Ephemeral });
    if (message.author.id !== interaction.client.user.id || !message.embeds.length) {
      return interaction.reply({ content: '❌ I can only edit embeds that I posted.', flags: MessageFlags.Ephemeral });
    }
    await interaction.showModal(buildModal(`embed:edit:${channel.id}:${message.id}`, 'Edit embed', message.embeds[0]));
  },

  async handleModal(interaction) {
    const [, action, channelId, messageId] = interaction.customId.split(':');
    const { embed, error } = embedFromModal(interaction);
    if (error) return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });

    const channel = interaction.guild.channels.cache.get(channelId);
    try {
      if (action === 'edit') {
        const message = await channel.messages.fetch(messageId);
        await message.edit({ embeds: [embed] });
        return interaction.reply({ content: `✅ [Embed updated](${message.url}).`, flags: MessageFlags.Ephemeral });
      }
      const message = await channel.send({ embeds: [embed] });
      await interaction.reply({ content: `✅ [Embed posted](${message.url}) in ${channel}.`, flags: MessageFlags.Ephemeral });
    } catch {
      await interaction.reply({ content: `❌ I couldn't post in ${channel}. Check my permissions there.`, flags: MessageFlags.Ephemeral });
    }
  },
};
