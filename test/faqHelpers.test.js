const { test, expect } = require("bun:test");
const { faqPanel, faqModal } = require("../lib/faq");

test("the panel menu holds at most 25 questions", () => {
    const faqs = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, question: `Question ${i}`, answer: "A" }));
    const menu = faqPanel(faqs).components[0].components[0].toJSON();
    expect(menu.custom_id).toBe("faq:select");
    expect(menu.options.length).toBe(25);
});

test("the edit form is prefilled", () => {
    const json = faqModal("faqmanage:edit:3", "Edit FAQ", { question: "Q?", answer: "A." }).toJSON();
    expect(json.custom_id).toBe("faqmanage:edit:3");
    expect(json.components[0].components[0].value).toBe("Q?");
    expect(json.components[1].components[0].value).toBe("A.");
});

test("the panel uses custom title and text", () => {
    const json = faqPanel([{ id: 1, question: "Q?" }], { title: "Help", text: "Choose one:" }).embeds[0].toJSON();
    expect(json.title).toBe("Help");
    expect(json.description).toBe("Choose one:\n\n• Q?");
});
