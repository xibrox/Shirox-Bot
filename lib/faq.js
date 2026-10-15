const {
    EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require("discord.js");
const { loadJsonFile } = require("./jsonFile");
const { getGuildConfig } = require("./guildConfig");
const { EMBED_COLOR } = require("./colors");

// { [guildId]: [{ id, question, answer }] }
const store = loadJsonFile("faq");

function getFaqs(guildId) {
    return store.data[guildId] || [];
}

function findFaq(guildId, id) {
    return getFaqs(guildId).find(f => f.id === Number(id)) || null;
}

function addFaq(guildId, question, answer) {
    const list = (store.data[guildId] ??= []);
    const faq = { id: (list.at(-1)?.id ?? 0) + 1, question, answer };
    list.push(faq);
    store.save();
    return faq;
}

function updateFaq(guildId, id, question, answer) {
    const faq = findFaq(guildId, id);
    if (!faq) return null;
    Object.assign(faq, { question, answer });
    store.save();
    return faq;
}

function removeFaq(guildId, id) {
    const list = getFaqs(guildId);
    const index = list.findIndex(f => f.id === Number(id));
    if (index === -1) return null;
    const [removed] = list.splice(index, 1);
    store.save();
    return removed;
}

// Autocomplete choices: FAQ id as the value, question as the label
function faqChoices(guildId, query) {
    const q = query.toLowerCase();
    return getFaqs(guildId)
        .filter(f => f.question.toLowerCase().includes(q))
        .slice(0, 25)
        .map(f => ({ name: f.question.slice(0, 100), value: String(f.id) }));
}

// Question/answer form; prefilled when editing an existing FAQ
function faqModal(customId, title, faq) {
    const question = new TextInputBuilder()
        .setCustomId("question").setLabel("Question").setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(true);
    const answer = new TextInputBuilder()
        .setCustomId("answer").setLabel("Answer").setStyle(TextInputStyle.Paragraph).setMaxLength(4000).setRequired(true);
    if (faq) {
        question.setValue(faq.question);
        answer.setValue(faq.answer);
    }
    return new ModalBuilder().setCustomId(customId).setTitle(title).addComponents(
        new ActionRowBuilder().addComponents(question),
        new ActionRowBuilder().addComponents(answer),
    );
}

const DEFAULT_PANEL_TITLE = "❓ Frequently Asked Questions";
const DEFAULT_PANEL_TEXT = "Pick a question from the menu below to see the answer.";

// The text plus as many question bullets as fit in an embed (4096 characters)
function panelDescription(text, faqs) {
    let list = "";
    for (const faq of faqs) {
        const line = `${list ? "\n" : ""}• ${faq.question}`;
        if (text.length + 2 + list.length + line.length + 2 > 4096) return `${text}\n\n${list}\n…`;
        list += line;
    }
    return `${text}\n\n${list}`;
}

// The public FAQ panel; its menu ("faq:select") is handled by commands/faq.js
function faqPanel(faqs, { title, text } = {}) {
    const shown = faqs.slice(0, 25);
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(title || DEFAULT_PANEL_TITLE)
        .setDescription(panelDescription(text || DEFAULT_PANEL_TEXT, shown));
    const menu = new StringSelectMenuBuilder()
        .setCustomId("faq:select")
        .setPlaceholder("Choose a question…")
        .addOptions(shown.map(f => ({ label: f.question.slice(0, 100), value: String(f.id) })));
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

// The panel with this server's saved title and text
function savedFaqPanel(guildId, faqs) {
    const config = getGuildConfig(guildId);
    return faqPanel(faqs, { title: config.faqPanelTitle, text: config.faqPanelText });
}

module.exports = {
    getFaqs, findFaq, addFaq, updateFaq, removeFaq, faqChoices, faqModal, faqPanel, savedFaqPanel, DEFAULT_PANEL_TITLE,
};
