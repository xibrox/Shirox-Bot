const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
} = require("discord.js");
const { COLORS } = require("./colors");
const { getGuildConfig, updateGuildConfig } = require("./guildConfig");

const TYPES = {
    bug: { emoji: "🐛", label: "Bug" },
    problem: { emoji: "⚠️", label: "Problem" },
    suggestion: { emoji: "💡", label: "Suggestion" },
    task: { emoji: "📝", label: "Task" },
};

const STATUSES = {
    open: { emoji: "⚪", label: "Open", color: COLORS.default },
    progress: { emoji: "🟡", label: "In progress", color: COLORS.warning },
    done: { emoji: "✅", label: "Done", color: COLORS.success },
    wontdo: { emoji: "🚫", label: "Won't do", color: COLORS.muted },
};

// Best guess from the wording; staff can change it with the dropdown on the card
function guessType(text) {
    if (/\b(bugs?|crash\w*|broken|errors?|glitch\w*|freez\w*|doesn'?t work|not working|stuck)\b/i.test(text)) return "bug";
    if (/\b(suggest\w*|feature|ideas?|would be (nice|cool|great)|(could|can) you add|please add|request)\b/i.test(text)) return "suggestion";
    if (/\b(problems?|issues?|can'?t|cannot|won'?t|unable)\b/i.test(text)) return "problem";
    return "task";
}

// "bug: player crashes" → { type: "bug", text: "player crashes" }
function stripTypePrefix(text) {
    const match = text.match(/^\s*(bug|problem|issue|suggestion|idea|task|todo)\s*[:-]\s*/i);
    if (!match) return { type: null, text };
    const word = match[1].toLowerCase();
    const type = { issue: "problem", idea: "suggestion", todo: "task" }[word] ?? word;
    return { type, text: text.slice(match[0].length) };
}

// Short title from the first line, the rest as details
function splitText(text) {
    const trimmed = text.trim();
    const [first, ...rest] = trimmed.split("\n");
    if (first.length <= 120) return { title: first.trim(), details: rest.join("\n").trim() };
    const cut = first.slice(0, 100);
    return { title: `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : 100)}…`, details: trimmed };
}

function statusRow(status) {
    const button = (id, label, style) => new ButtonBuilder().setCustomId(`todo:status:${id}`).setLabel(label).setStyle(style);
    const closed = status === "done" || status === "wontdo";
    return new ActionRowBuilder().addComponents(
        ...(closed
            ? [button("open", "Reopen", ButtonStyle.Secondary)]
            : [
                status === "progress"
                    ? button("open", "Back to open", ButtonStyle.Secondary)
                    : button("progress", "In progress", ButtonStyle.Primary),
                button("done", "Done", ButtonStyle.Success),
                button("wontdo", "Won't do", ButtonStyle.Secondary),
            ]),
        new ButtonBuilder().setCustomId("todo:editcard").setLabel("Edit").setStyle(ButtonStyle.Secondary),
    );
}

function typeRow(type) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId("todo:type")
            .addOptions(Object.entries(TYPES).map(([value, t]) => ({ label: t.label, emoji: t.emoji, value, default: value === type }))),
    );
}

const cardComponents = (type, status) => [statusRow(status), typeRow(type)];

// Type, number and status are stored in the card itself, so these read them back
function readCard(embed) {
    const header = embed.author?.name ?? "";
    const type = Object.keys(TYPES).find(t => header.includes(TYPES[t].label)) ?? "task";
    const number = header.match(/#(\d+)/)?.[1] ?? "?";
    const statusField = embed.fields?.find(f => f.name === "Status")?.value ?? "";
    const status = Object.keys(STATUSES).find(s => statusField.includes(STATUSES[s].label)) ?? "open";
    return { type, number, status };
}

function setType(embed, type, number) {
    return embed.setAuthor({ name: `${TYPES[type].emoji} ${TYPES[type].label} · #${number}` });
}

function setStatus(embed, status, user) {
    const s = STATUSES[status];
    const by = status === "open" ? "" : ` · ${user} <t:${Math.floor(Date.now() / 1000)}:R>`;
    const fields = (embed.data.fields ?? []).filter(f => f.name !== "Status");
    return embed.setColor(s.color).setFields(...fields, { name: "Status", value: `${s.emoji} ${s.label}${by}`, inline: false });
}

// What a message says and who wrote it. For a forwarded message that's the original, not the forward.
async function readSource(message) {
    const snapshot = message.messageSnapshots?.first();
    if (!snapshot) {
        return { content: message.content, attachments: [...message.attachments.values()], reporter: message.author, sourceUrl: message.url };
    }
    const { guildId, channelId, messageId } = message.reference ?? {};
    const sourceUrl = channelId && messageId ? `https://discord.com/channels/${guildId ?? "@me"}/${channelId}/${messageId}` : null;
    const original = await message.client.channels.fetch(channelId)
        .then(channel => channel?.messages?.fetch(messageId))
        .catch(() => null);
    return {
        content: snapshot.content ?? "",
        attachments: [...(snapshot.attachments?.values() ?? [])],
        reporter: original?.author ?? null,
        sourceUrl,
    };
}

// Posts a todo card in the server's todo channel. Throws if no channel is set or the bot can't post.
async function postTodo(guild, { type, title, details, reporter, sourceUrl, attachments = [], addedBy }) {
    const config = getGuildConfig(guild.id);
    const channel = config.todoChannelId && guild.channels.cache.get(config.todoChannelId);
    if (!channel) throw new Error("No todo channel is set. Use `/todo channel` first.");

    const number = (config.todoCount ?? 0) + 1;
    const embed = new EmbedBuilder().setTitle(title.slice(0, 256)).setTimestamp();
    setType(embed, type, number);
    if (details) embed.setDescription(details.slice(0, 4096));

    const fields = [];
    if (reporter) fields.push({ name: "Reported by", value: `${reporter} (${reporter.username})`, inline: true });
    if (sourceUrl) fields.push({ name: "Source", value: `[Jump to message](${sourceUrl})`, inline: true });
    embed.addFields(fields);
    setStatus(embed, "open");
    embed.setFooter({ text: `Added by ${addedBy.username}`, iconURL: addedBy.displayAvatarURL() });

    // Re-upload attachments so they survive the original message being deleted
    const kept = attachments.slice(0, 10).filter(a => a.size <= 10 * 1024 * 1024);
    const files = kept.map((a, i) => ({ attachment: a.url, name: `${i}_${a.name.replace(/[^\w.-]/g, "_")}` }));
    const imageIndex = kept.findIndex(a => a.contentType?.startsWith("image/"));
    if (imageIndex !== -1) embed.setImage(`attachment://${files[imageIndex].name}`);

    const message = await channel.send({ embeds: [embed], files, components: cardComponents(type, "open") });
    updateGuildConfig(guild.id, { todoCount: number });
    return message;
}

module.exports = {
    TYPES, STATUSES, guessType, stripTypePrefix, splitText, readSource, postTodo,
    readCard, setType, setStatus, cardComponents,
};
