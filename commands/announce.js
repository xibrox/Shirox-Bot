const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, RoleSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, InteractionContextType,
} = require('discord.js');
const { EMBED_COLOR } = require('../lib/colors');
const { asOwnerCommand } = require('../lib/owner');
const { getGuildConfig, updateGuildConfig } = require('../lib/guildConfig');
const { fetchNewCommits, findBuildCommit, writeChangelog } = require('../lib/changelog');
const { saveDraft, getDraft, dropDraft, previewButtons, closePreview, EXPIRED } = require('../lib/preview');

const DEFAULT_REPO = 'xibrox/Shirox';

// "owner/name" or any github.com link to the repo
function parseRepo(input) {
  const match = input.trim().match(/(?:github\.com\/)?([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i);
  return match?.[1] ?? null;
}

const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Where the last announcement left off, newest message first: the commit the bot last announced,
// a GitHub link in one of the bot's announcements, or a message mentioning a build number
// (like "build 120", matched to the commit that bumped to it). Otherwise the channel's last message.
async function findStartPoint(channel, repo, config) {
  if (config.announceLastSha && config.announceRepo === repo) {
    return { sinceSha: config.announceLastSha, label: 'the last announcement' };
  }
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!messages?.size) return { label: 'the latest commits' };
  const link = new RegExp(`github\\.com/${escapeRegex(repo)}/(?:compare/\\w+\\.\\.\\.(\\w+)|commit/(\\w+))`, 'i');
  const commitCache = {};
  for (const message of messages.values()) {
    if (message.author.id === channel.client.user.id) {
      const match = message.embeds[0]?.url?.match(link);
      if (match) return { sinceSha: match[1] ?? match[2], label: `[this announcement](${message.url})` };
    }
    const text = [message.content, ...message.embeds.flatMap(e => [e.title, e.description])].filter(Boolean).join('\n');
    const build = text.match(/\bbuild\s*#?\s*(\d{2,})\b/i)?.[1];
    const commit = build && await findBuildCommit(repo, build, commitCache).catch(() => null);
    if (commit) return { sinceSha: commit.sha, label: `build ${build} ([announced here](${message.url}))` };
  }
  const last = messages.first();
  return { sinceDate: last.createdAt, label: `[the last message](${last.url})` };
}

function announcementEmbed(draft) {
  const head = draft.commits.at(-1).sha;
  const url = draft.baseSha
    ? `https://github.com/${draft.repo}/compare/${draft.baseSha.slice(0, 12)}...${head.slice(0, 12)}`
    : `https://github.com/${draft.repo}/commit/${head}`;
  const count = draft.commits.length;
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({ name: draft.repo, url: `https://github.com/${draft.repo}` })
    .setTitle(draft.title.slice(0, 256))
    .setURL(url)
    .setDescription(draft.body)
    .setFooter({ text: `${count} commit${count === 1 ? '' : 's'}` })
    .setTimestamp();
}

function previewMessage(id, draft) {
  const writer = draft.model ? `written by \`${draft.model}\`` : "⚠️ the AI wasn't available, so this is the basic cleanup";
  const pings = draft.roleIds.length ? `Pings: ${draft.roleIds.map(r => `<@&${r}>`).join(' ')}` : 'No pings, pick roles below to add some.';
  const roles = new RoleSelectMenuBuilder()
    .setCustomId(`announce:roles:${id}`)
    .setPlaceholder('Roles to ping (optional)')
    .setMinValues(0)
    .setMaxValues(10)
    .setDefaultRoles(draft.roleIds);
  const regenerate = new ButtonBuilder().setCustomId(`announce:regen:${id}`).setLabel('Rewrite').setStyle(ButtonStyle.Secondary);
  return {
    content: `**Preview** for <#${draft.channelId}>, ${writer}.\nCommits since ${draft.startLabel}. Wrong start? Run it again with \`from:\`.\n${pings}`,
    embeds: [announcementEmbed(draft)],
    components: [new ActionRowBuilder().addComponents(roles), previewButtons('announce', id, { extra: [regenerate] })],
    allowedMentions: { parse: [] },
  };
}

function editModal(id, draft) {
  const title = new TextInputBuilder().setCustomId('title').setLabel('Title').setStyle(TextInputStyle.Short)
    .setMaxLength(256).setRequired(true).setValue(draft.title.slice(0, 256));
  const body = new TextInputBuilder().setCustomId('body').setLabel('Changelog').setStyle(TextInputStyle.Paragraph)
    .setMaxLength(4000).setRequired(true).setValue(draft.body.slice(0, 4000));
  return new ModalBuilder().setCustomId(`announce:revise:${id}`).setTitle('Edit announcement').addComponents(
    new ActionRowBuilder().addComponents(title),
    new ActionRowBuilder().addComponents(body),
  );
}

module.exports = {
  category: 'owner',
  ownerOnly: true,
  data: asOwnerCommand(new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Post an update announcement made from new GitHub commits')
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Write an announcement from commits since the last one (shows a preview first)')
        .addStringOption(option =>
          option.setName('from')
            .setDescription('Commit SHA to start after, instead of where the last announcement stopped')))
    .addSubcommand(sub =>
      sub.setName('channel')
        .setDescription('Set the announcement channel and GitHub repo')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Where announcements go')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true))
        .addStringOption(option =>
          option.setName('repo')
            .setDescription(`GitHub repo as owner/name or a link (default ${DEFAULT_REPO})`)))
    .setDMPermission(false))
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    const config = getGuildConfig(interaction.guild.id);

    if (interaction.options.getSubcommand() === 'channel') {
      const channel = interaction.options.getChannel('channel');
      const repoInput = interaction.options.getString('repo');
      const repo = repoInput ? parseRepo(repoInput) : (config.announceRepo ?? DEFAULT_REPO);
      if (!repo) return interaction.reply({ content: '❌ Give the repo as `owner/name` or a GitHub link.', flags: MessageFlags.Ephemeral });
      if (!channel.permissionsFor(interaction.guild.members.me).has([
        PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory,
      ])) {
        return interaction.reply({
          content: `❌ I need View Channel, Send Messages, Embed Links and Read Message History in ${channel}.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      const sameRepo = repo === config.announceRepo;
      updateGuildConfig(interaction.guild.id, {
        announceChannelId: channel.id,
        announceRepo: repo,
        announceLastSha: sameRepo ? config.announceLastSha : null,
      });
      return interaction.reply({ content: `✅ Announcements for **${repo}** go to ${channel}.`, flags: MessageFlags.Ephemeral });
    }

    const channel = config.announceChannelId && interaction.guild.channels.cache.get(config.announceChannelId);
    if (!channel) return interaction.reply({ content: '❌ Set the channel first with `/announce channel`.', flags: MessageFlags.Ephemeral });
    const repo = config.announceRepo ?? DEFAULT_REPO;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const from = interaction.options.getString('from')?.trim();
    const start = from ? { sinceSha: from, label: `commit \`${from.slice(0, 7)}\`` } : await findStartPoint(channel, repo, config);

    let commits;
    try {
      commits = await fetchNewCommits(repo, start);
    } catch (err) {
      return interaction.editReply(`❌ Couldn't read commits from **${repo}**: ${err.message}`);
    }
    if (!commits.length) {
      return interaction.editReply(`Nothing new on **${repo}** since ${start.label}.`);
    }

    await interaction.editReply(`✍️ Writing the changelog from ${commits.length} commit${commits.length === 1 ? '' : 's'}, this can take a minute…`);
    const draft = {
      channelId: channel.id,
      repo,
      commits,
      baseSha: start.sinceSha ?? null,
      startLabel: start.label,
      roleIds: (config.announceRoleIds ?? []).filter(id => interaction.guild.roles.cache.has(id)),
      ...(await writeChangelog(commits, repo)),
    };
    await interaction.editReply(previewMessage(saveDraft(draft), draft));
  },

  // Role picker, Post / Edit / Rewrite / Cancel under the preview
  async handleComponent(interaction) {
    const [, action, id] = interaction.customId.split(':');
    const draft = getDraft(id);
    if (!draft) return interaction.update(EXPIRED);

    if (action === 'roles') {
      draft.roleIds = interaction.values;
      return interaction.update(previewMessage(id, draft));
    }
    if (action === 'edit') return interaction.showModal(editModal(id, draft));
    if (action === 'regen') {
      await interaction.update({ content: '✍️ Rewriting…', components: [] });
      Object.assign(draft, await writeChangelog(draft.commits, draft.repo));
      return interaction.editReply(previewMessage(id, draft));
    }

    dropDraft(id);
    if (action === 'cancel') return interaction.update(closePreview('Cancelled, nothing was posted.'));

    const channel = interaction.guild.channels.cache.get(draft.channelId);
    let message;
    try {
      message = await channel.send({
        content: draft.roleIds.map(r => `<@&${r}>`).join(' ') || undefined,
        embeds: [announcementEmbed(draft)],
        allowedMentions: { roles: draft.roleIds },
      });
    } catch {
      return interaction.update(closePreview(`❌ I couldn't post in ${channel}. Check my permissions there.`));
    }
    updateGuildConfig(interaction.guild.id, {
      announceLastSha: draft.commits.at(-1).sha,
      announceRepo: draft.repo,
      announceRoleIds: draft.roleIds,
    });

    // Roles that aren't "mentionable" only ping if the bot has Mention Everyone
    const canMentionAll = channel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.MentionEveryone);
    const silent = draft.roleIds.map(r => interaction.guild.roles.cache.get(r)).filter(r => r && !r.mentionable && !canMentionAll);
    const note = silent.length
      ? `\n⚠️ ${silent.map(r => `**${r.name}**`).join(', ')} didn't get pinged. Make the role mentionable or give me Mention Everyone.`
      : '';
    await interaction.update(closePreview(`✅ [Announcement posted](${message.url}) in ${channel}.${note}`));
  },

  // Edit form submitted
  async handleModal(interaction) {
    const [, , id] = interaction.customId.split(':');
    const draft = getDraft(id);
    if (!draft) return interaction.update(EXPIRED);
    draft.title = interaction.fields.getTextInputValue('title').trim();
    draft.body = interaction.fields.getTextInputValue('body').trim();
    await interaction.update(previewMessage(id, draft));
  },
};
