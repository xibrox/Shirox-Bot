const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ApplicationCommandType, ApplicationCommandOptionType, MessageFlags } = require('discord.js');
const { EMBED_COLOR } = require('../lib/colors');

const CATEGORIES = {
  fun: { title: '🎮 Fun', blurb: 'Games and random stuff' },
  utility: { title: '🛠️ Utility', blurb: 'Info, tools, FAQ and GIFs' },
  moderation: { title: '🛡️ Moderation', blurb: 'Purge, bans, warnings, embeds' },
  setup: { title: '⚙️ Setup', blurb: 'Logs, honeypot, automod, welcome & more' },
  apps: { title: '🖱️ Right-click Apps', blurb: 'Right-click a user or message → Apps' },
};

const { prefixFor } = require('../events/prefixCommands');

const prefixNote = guild => `Prefix commands also work: ${['quote', 'roll', 'coin', 'choose', 'number', 'say'].map(c => prefixFor(guild) + c).join(' ')}`;

// Members only see commands they have the Discord permissions to use
function canUse(command, interaction) {
  const required = command.data.default_member_permissions;
  if (!required) return true;
  return !!interaction.memberPermissions?.has(BigInt(required));
}

function visibleCommands(interaction, category) {
  return [...interaction.client.commands.values()]
    .filter(c => c.category === category && canUse(c, interaction))
    .sort((a, b) => a.data.name.localeCompare(b.data.name));
}

function formatOptions(options = []) {
  return options
    .filter(o => o.type !== ApplicationCommandOptionType.Subcommand)
    .map(o => (o.required ? `<${o.name}>` : `[${o.name}]`))
    .join(' ');
}

// One or more lines of help text for a command, generated from its definition
function describe(command) {
  const json = command.data.toJSON();
  if (json.type === ApplicationCommandType.User || json.type === ApplicationCommandType.Message) {
    const target = json.type === ApplicationCommandType.User ? 'a user' : 'a message';
    return `**${json.name}**: right-click ${target} → Apps\n${command.description || ''}`;
  }

  const subcommands = (json.options || []).filter(o => o.type === ApplicationCommandOptionType.Subcommand);
  if (subcommands.length) {
    const lines = subcommands.map(s => `\`/${json.name} ${s.name}${formatOptions(s.options) ? ` ${formatOptions(s.options)}` : ''}\`: ${s.description}`);
    return `**/${json.name}**: ${json.description}\n${lines.join('\n')}`;
  }
  const usage = formatOptions(json.options);
  return `**\`/${json.name}${usage ? ` ${usage}` : ''}\`**\n${json.description}`;
}

// Splits long help text across several embeds (4096 character limit each)
function categoryEmbeds(interaction, category) {
  const sections = visibleCommands(interaction, category).map(describe);
  const embeds = [];
  let text = '';
  for (const section of sections) {
    if (text.length + section.length + 2 > 4000) {
      embeds.push(text);
      text = '';
    }
    text += (text ? '\n\n' : '') + section;
  }
  if (text) embeds.push(text);

  return embeds.map((description, i) => {
    const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription(description);
    if (i === 0) embed.setTitle(CATEGORIES[category].title);
    if (i === embeds.length - 1) embed.setFooter({ text: '<required> [optional]' });
    return embed;
  });
}

function availableCategories(interaction) {
  return Object.keys(CATEGORIES).filter(c => visibleCommands(interaction, c).length);
}

function categoryMenu(interaction, selected) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('help:category')
    .setPlaceholder('Choose a category…')
    .addOptions(availableCategories(interaction).map(c => ({
      label: CATEGORIES[c].title.replace(/^\S+\s/, ''),
      emoji: CATEGORIES[c].title.split(' ')[0],
      description: CATEGORIES[c].blurb,
      value: c,
      default: c === selected,
    })));
  return new ActionRowBuilder().addComponents(menu);
}

function overviewEmbed(interaction) {
  const categories = availableCategories(interaction);
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`✨ ${interaction.client.user.username} Help`)
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setDescription('Pick a category from the menu below, or use `/help [category]`.')
    .addFields(categories.map(c => ({
      name: CATEGORIES[c].title,
      value: `${CATEGORIES[c].blurb}\n${visibleCommands(interaction, c).length} commands`,
      inline: true,
    })))
    .setFooter({ text: prefixNote(interaction.guild) });
}

module.exports = {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Shows all available commands')
    .addStringOption(option =>
      option.setName('category')
        .setDescription('Command category to show')
        .addChoices(...Object.entries(CATEGORIES).map(([value, c]) => ({ name: c.title.replace(/^\S+\s/, ''), value })))),

  async execute(interaction) {
    const category = interaction.options.getString('category');
    if (!category) {
      return interaction.reply({ embeds: [overviewEmbed(interaction)], components: [categoryMenu(interaction)] });
    }
    if (!visibleCommands(interaction, category).length) {
      return interaction.reply({ content: '❌ You do not have permission to use any commands in this category.', flags: MessageFlags.Ephemeral });
    }
    await interaction.reply({ embeds: categoryEmbeds(interaction, category), components: [categoryMenu(interaction, category)] });
  },

  // Category dropdown under the help message (customId "help:category")
  async handleComponent(interaction) {
    const category = interaction.values[0];
    const reply = { embeds: categoryEmbeds(interaction, category), components: [categoryMenu(interaction, category)] };
    // Only the person who ran /help changes the message; anyone else gets their own private copy
    const ownerId = interaction.message.interactionMetadata?.user?.id ?? interaction.message.interaction?.user?.id;
    if (ownerId && ownerId !== interaction.user.id) return interaction.reply({ ...reply, flags: MessageFlags.Ephemeral });
    await interaction.update(reply);
  },
};
