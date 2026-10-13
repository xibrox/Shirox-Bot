const { Events } = require("discord.js");
const { getGuildConfig } = require("../lib/guildConfig");
const { suppressLogsFor } = require("../lib/logger");
const { isOwner } = require("../lib/owner");
const { guessType, stripTypePrefix, splitText, readSource, postTodo } = require("../lib/todo");

// The owner's messages and forwards in the todo channel are replaced with a todo card.
// Messages starting with "//" are left alone so you can still chat there.
module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (!message.inGuild() || message.author.bot) return;
        if (message.channelId !== getGuildConfig(message.guild.id).todoChannelId) return;
        if (!isOwner(message.author.id)) return;
        if (message.content.startsWith("//")) return;

        const source = await readSource(message);
        const forwarded = message.messageSnapshots?.size > 0;
        if (!source.content && !source.attachments.length) return;

        const { type, text } = stripTypePrefix(source.content);
        const { title, details } = splitText(text || source.attachments[0]?.name || "Untitled");
        await postTodo(message.guild, {
            type: type ?? guessType(text),
            title,
            details,
            // When the owner types it themselves, they're the one adding it, not a reporter
            reporter: forwarded ? source.reporter : null,
            sourceUrl: forwarded ? source.sourceUrl : null,
            attachments: source.attachments,
            addedBy: message.author,
        });

        suppressLogsFor(message.id);
        await message.delete().catch(() => {});
    },
};
