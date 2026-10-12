const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  PermissionFlagsBits, MessageFlags, version: djsVersion,
} = require('discord.js');
const { EMBED_COLOR, COLORS } = require('../lib/colors');
const { formatDuration } = require('../lib/duration');
const { asOwnerCommand, OWNER_IDS } = require('../lib/owner');
const { getJoinInfo, refreshJoinInfo } = require('../lib/botGuilds');
const { createPermanentInvite } = require('../lib/invites');
const { getSupportInviteUrl, setSupportInvite } = require('../lib/supportInvite');
const { version: botVersion } = require('../package.json');

const SERVERS_PER_PAGE = 10;
const unix = ms => Math.floor(ms / 1000);
const mb = bytes => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function sortedGuilds(client) {
  return [...client.guilds.cache.values()].sort((a, b) => b.memberCount - a.memberCount);
}

function addedByText(guildId) {
  const addedBy = getJoinInfo(guildId)?.addedBy;
  return addedBy ? `<@${addedBy}>` : 'unknown';
}

function navRow(current) {
  const button = (id, label) => new ButtonBuilder()
    .setCustomId(`owner:${id}`)
    .setLabel(label)
    .setStyle(id === current ? ButtonStyle.Primary : ButtonStyle.Secondary)
    .setDisabled(id === current);
  return new ActionRowBuilder().addComponents(button('overview', '📊 Overview'), button('info', '🤖 Bot info'), button('servers', '🌐 Servers'));
}

// ===== Views (each returns a full reply/update payload) =====

function overviewView(client) {
  const guilds = sortedGuilds(client);
  const users = guilds.reduce((sum, g) => sum + g.memberCount, 0);
  const newest = [...guilds].sort((a, b) => b.joinedTimestamp - a.joinedTimestamp).slice(0, 5);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`📊 ${client.user.username} dashboard`)
    .setThumbnail(client.user.displayAvatarURL())
    .addFields(
      { name: 'Servers', value: `${guilds.length}`, inline: true },
      { name: 'Members (total)', value: `${users.toLocaleString()}`, inline: true },
      { name: 'Commands', value: `${client.commands.size}`, inline: true },
      { name: 'Ping', value: `${client.ws.ping} ms`, inline: true },
      { name: 'Uptime', value: formatDuration(client.uptime), inline: true },
      { name: 'Memory', value: mb(process.memoryUsage().rss), inline: true },
      {
        name: 'Recently joined',
        value: newest.map(g => `**${g.name}** · <t:${unix(g.joinedTimestamp)}:R> · added by ${addedByText(g.id)}`).join('\n') || 'None',
      },
    );
  return { embeds: [embed], components: [navRow('overview')] };
}

function infoView(client) {
  const app = client.application;
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`🤖 ${client.user.tag}`)
    .setThumbnail(client.user.displayAvatarURL())
    .addFields(
      { name: 'Bot ID', value: `\`${client.user.id}\``, inline: true },
      { name: 'Created', value: `<t:${unix(client.user.createdTimestamp)}:D>`, inline: true },
      { name: 'Owner', value: OWNER_IDS.map(id => `<@${id}>`).join(', ') || 'Not set', inline: true },
      { name: 'Bot version', value: botVersion, inline: true },
      { name: 'discord.js', value: djsVersion, inline: true },
      { name: 'Runtime', value: process.versions.bun ? `Bun ${process.versions.bun}` : `Node ${process.version}`, inline: true },
      { name: 'Online since', value: `<t:${unix(Date.now() - client.uptime)}:R>`, inline: true },
      { name: 'Memory', value: `${mb(process.memoryUsage().rss)} (heap ${mb(process.memoryUsage().heapUsed)})`, inline: true },
      { name: 'Platform', value: `${process.platform} ${process.arch}`, inline: true },
      { name: 'Servers', value: `${client.guilds.cache.size}`, inline: true },
      { name: 'Commands', value: `${client.commands.size}`, inline: true },
      { name: 'Ping', value: `${client.ws.ping} ms`, inline: true },
    );
  if (app?.approximateUserInstallCount != null) {
    embed.addFields({ name: 'User installs', value: `${app.approximateUserInstallCount}`, inline: true });
  }
  return { embeds: [embed], components: [navRow('info')] };
}

function serversView(client, page) {
  const guilds = sortedGuilds(client);
  const pages = Math.max(1, Math.ceil(guilds.length / SERVERS_PER_PAGE));
  page = Math.min(Math.max(page, 0), pages - 1);
  const slice = guilds.slice(page * SERVERS_PER_PAGE, (page + 1) * SERVERS_PER_PAGE);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`🌐 Servers (${guilds.length})`)
    .setDescription(slice.map((g, i) =>
      `**${page * SERVERS_PER_PAGE + i + 1}. ${g.name}**\n${g.memberCount} members · joined <t:${unix(g.joinedTimestamp)}:R> · added by ${addedByText(g.id)}`,
    ).join('\n') || 'The bot is not in any servers.')
    .setFooter({ text: `Page ${page + 1}/${pages} · pick a server below for details` });

  const components = [navRow('servers')];
  if (slice.length) {
    components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId('owner:server')
      .setPlaceholder('Open a server…')
      .addOptions(slice.map(g => ({ label: g.name.slice(0, 100), description: `${g.memberCount} members · ${g.id}`, value: g.id })))));
  }
  if (pages > 1) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`owner:servers:${page - 1}`).setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId(`owner:servers:${page + 1}`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(page === pages - 1),
    ));
  }
  return { embeds: [embed], components };
}

async function serverView(client, guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return { content: '❌ The bot is not in that server anymore.', embeds: [], components: [navRow('')] };

  const { addedBy } = await refreshJoinInfo(guild);
  const me = guild.members.me;
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(guild.name)
    .setThumbnail(guild.iconURL())
    .addFields(
      { name: 'Server ID', value: `\`${guild.id}\``, inline: true },
      { name: 'Owner', value: `<@${guild.ownerId}>\n\`${guild.ownerId}\``, inline: true },
      { name: 'Members', value: `${guild.memberCount}`, inline: true },
      { name: 'Added by', value: addedBy ? `<@${addedBy}>\n\`${addedBy}\`` : 'Unknown (joined over 45 days ago or no audit log access)', inline: true },
      { name: 'Bot joined', value: `<t:${unix(guild.joinedTimestamp)}:f>`, inline: true },
      { name: 'Server created', value: `<t:${unix(guild.createdTimestamp)}:D>`, inline: true },
      { name: 'Channels / roles', value: `${guild.channels.cache.size} / ${guild.roles.cache.size}`, inline: true },
      { name: 'Boosts', value: `${guild.premiumSubscriptionCount ?? 0} (tier ${guild.premiumTier})`, inline: true },
      { name: 'Bot is admin', value: me?.permissions.has(PermissionFlagsBits.Administrator) ? 'Yes' : 'No', inline: true },
    );
  if (guild.vanityURLCode) embed.addFields({ name: 'Vanity URL', value: `https://discord.gg/${guild.vanityURLCode}` });

  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`owner:invite:${guild.id}`).setLabel('🔗 Get invite').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`owner:leave:${guild.id}`).setLabel('🚪 Leave server').setStyle(ButtonStyle.Danger),
  );
  return { content: '', embeds: [embed], components: [navRow(''), actions] };
}

module.exports = {
  category: 'owner',
  ownerOnly: true,
  data: asOwnerCommand(new SlashCommandBuilder()
    .setName('owner')
    .setDescription('Bot owner tools')
    .addSubcommand(sub => sub.setName('dashboard').setDescription('Overview of the bot with stats and server browser'))
    .addSubcommand(sub => sub.setName('info').setDescription('Technical info about the bot'))
    .addSubcommand(sub => sub.setName('servers').setDescription('Every server the bot is in and who added it'))
    .addSubcommand(sub => sub.setName('server').setDescription('Details about one server')
      .addStringOption(o => o.setName('server').setDescription('Server name or ID').setRequired(true).setAutocomplete(true)))
    .addSubcommand(sub => sub.setName('supportinvite').setDescription('Show or change the invite used by /shirox')
      .addStringOption(o => o.setName('invite').setDescription('New invite code or link (leave empty to just show it)')))),

  async execute(interaction) {
    const { client } = interaction;
    const sub = interaction.options.getSubcommand();
    const ephemeral = { flags: MessageFlags.Ephemeral };

    if (sub === 'dashboard') return interaction.reply({ ...overviewView(client), ...ephemeral });
    if (sub === 'info') return interaction.reply({ ...infoView(client), ...ephemeral });
    if (sub === 'servers') return interaction.reply({ ...serversView(client, 0), ...ephemeral });

    await interaction.deferReply(ephemeral);
    if (sub === 'server') return interaction.editReply(await serverView(client, interaction.options.getString('server')));

    const input = interaction.options.getString('invite');
    if (input && !(await setSupportInvite(client, input))) return interaction.editReply("❌ That invite doesn't work.");
    const url = await getSupportInviteUrl(client);
    await interaction.editReply(url
      ? `${input ? '✅ Updated. ' : ''}/shirox gives out: ${url}`
      : "❌ No working invite, and I couldn't make one. Am I in the Shirox server with **Create Invite**?");
  },

  async autocomplete(interaction) {
    const query = interaction.options.getFocused().toLowerCase();
    const matches = sortedGuilds(interaction.client)
      .filter(g => g.name.toLowerCase().includes(query) || g.id.startsWith(query))
      .slice(0, 25);
    await interaction.respond(matches.map(g => ({ name: `${g.name} (${g.memberCount} members)`.slice(0, 100), value: g.id })));
  },

  // customIds: owner:overview | owner:info | owner:servers[:<page>] | owner:server (select) | owner:invite|leave|leave-confirm:<guildId>
  async handleComponent(interaction) {
    const { client } = interaction;
    const [, action, arg] = interaction.customId.split(':');

    if (action === 'overview') return interaction.update(overviewView(client));
    if (action === 'info') return interaction.update(infoView(client));
    if (action === 'servers') return interaction.update(serversView(client, Number(arg) || 0));
    if (action === 'server') {
      await interaction.deferUpdate();
      return interaction.editReply(await serverView(client, interaction.values[0]));
    }

    const guild = client.guilds.cache.get(arg);
    if (!guild) return interaction.reply({ content: '❌ The bot is not in that server anymore.', flags: MessageFlags.Ephemeral });

    if (action === 'invite') {
      const invite = guild.vanityURLCode
        ? { url: `https://discord.gg/${guild.vanityURLCode}` }
        : await createPermanentInvite(guild, { reason: 'Requested by the bot owner' }).catch(() => null);
      return interaction.reply({
        content: invite ? `🔗 **${guild.name}**: ${invite.url}` : "❌ I don't have **Create Invite** in any channel there.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (action === 'leave') {
      const confirm = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`owner:leave-confirm:${guild.id}`).setLabel(`Yes, leave ${guild.name}`.slice(0, 80)).setStyle(ButtonStyle.Danger),
      );
      return interaction.reply({ content: `⚠️ Make the bot leave **${guild.name}**? It can only come back if someone re-invites it.`, components: [confirm], flags: MessageFlags.Ephemeral });
    }

    if (action === 'leave-confirm') {
      await guild.leave();
      return interaction.update({ content: `🚪 Left **${guild.name}**.`, components: [] });
    }
  },
};
