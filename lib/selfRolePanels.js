const { loadJsonFile } = require("./jsonFile");
const { DEFAULT_SELF_ROLE_TEXT } = require("./selfRoles");

// { [guildId]: [{ messageId, channelId, title, description, roleIds }] }
const store = loadJsonFile("self-role-panels");

const getPanels = guildId => store.data[guildId] || [];
const findPanel = (guildId, messageId) => getPanels(guildId).find(p => p.messageId === messageId) || null;

// Inserts a panel, or replaces the one with the same message id
function savePanel(guildId, panel) {
    const list = (store.data[guildId] ??= []);
    const index = list.findIndex(p => p.messageId === panel.messageId);
    if (index === -1) list.push(panel);
    else list[index] = panel;
    store.save();
}

function removePanel(guildId, messageId) {
    store.data[guildId] = getPanels(guildId).filter(p => p.messageId !== messageId);
    store.save();
}

const LINK_REGEX = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)\/?$/;

// "https://discord.com/channels/<guild>/<channel>/<message>" -> ids, or null
function parseMessageLink(text) {
    const match = text.trim().match(LINK_REGEX);
    return match ? { guildId: match[1], channelId: match[2], messageId: match[3] } : null;
}

// Reads a self-role panel the bot posted earlier, or null if the message isn't one
function readPanelMessage(message, botId) {
    if (message.author?.id !== botId) return null;
    const roleIds = message.components
        .flatMap(row => row.components ?? [])
        .map(component => component?.customId)
        .filter(id => id?.startsWith("selfrole:"))
        .map(id => id.slice("selfrole:".length));
    if (!roleIds.length) return null;

    const embed = message.embeds[0];
    const text = embed?.description ?? "";
    // The description ends with the "\n\n• <role>" list the bot adds
    const cut = text.lastIndexOf("\n\n• ");
    const description = (cut === -1 ? text : text.slice(0, cut)).trim();
    return {
        messageId: message.id,
        channelId: message.channelId,
        title: embed?.title || "Roles",
        description: description && description !== DEFAULT_SELF_ROLE_TEXT ? description : null,
        roleIds,
    };
}

module.exports = { getPanels, findPanel, savePanel, removePanel, parseMessageLink, readPanelMessage };
