const { loadJsonFile } = require("./jsonFile");

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

module.exports = { getFaqs, findFaq, addFaq, updateFaq, removeFaq, faqChoices };
