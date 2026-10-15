const { describe, test, expect } = require("bun:test");
const setup = require("../commands/setup");
const { addFaq, getFaqs } = require("../lib/faq");
const { fakeGuild, fakeChannel, fakeInteraction } = require("./fakes");

const update = interaction => interaction.update.mock.calls[0][0];
const lastRow = payload => payload.components.at(-1).toJSON().components;

describe("FAQ section", () => {
    test("picking a question enables Edit and Remove for it", async () => {
        const interaction = fakeInteraction({ customId: "setup:faq:pick" });
        const faq = addFaq(interaction.guild.id, "How?", "Like this.");
        interaction.values = [String(faq.id)];
        await setup.handleComponent(interaction);
        const [, edit, remove] = update(interaction).components.at(-2).toJSON().components;
        expect(edit).toMatchObject({ custom_id: `setup:faq:edit:${faq.id}`, disabled: false });
        expect(remove).toMatchObject({ custom_id: `setup:faq:remove:${faq.id}`, disabled: false });
    });

    test("Remove deletes the question", async () => {
        const guild = fakeGuild();
        const faq = addFaq(guild.id, "How?", "Like this.");
        const interaction = fakeInteraction({ guild, customId: `setup:faq:remove:${faq.id}` });
        await setup.handleComponent(interaction);
        expect(getFaqs(guild.id)).toEqual([]);
        expect(update(interaction).content).toStartWith("🗑️ Removed **How?**.");
    });

    test("Add opens the existing FAQ form", async () => {
        const interaction = fakeInteraction({ customId: "setup:faq:add" });
        await setup.handleComponent(interaction);
        expect(interaction.showModal.mock.calls[0][0].toJSON().custom_id).toBe("faqmanage:add");
    });

    test("Edit opens the form prefilled for that question", async () => {
        const guild = fakeGuild();
        const faq = addFaq(guild.id, "How?", "Like this.");
        const interaction = fakeInteraction({ guild, customId: `setup:faq:edit:${faq.id}` });
        await setup.handleComponent(interaction);
        const modal = interaction.showModal.mock.calls[0][0].toJSON();
        expect(modal.custom_id).toBe(`faqmanage:edit:${faq.id}`);
        expect(modal.components[0].components[0].value).toBe("How?");
    });

    test("posting the panel sends it to the picked channel", async () => {
        const channel = fakeChannel();
        const guild = fakeGuild({ channels: [channel] });
        addFaq(guild.id, "How?", "Like this.");
        const interaction = fakeInteraction({ guild, customId: "setup:faq:panel", values: [channel.id] });
        await setup.handleComponent(interaction);
        expect(channel.send.mock.calls[0][0].components[0].toJSON().components[0].custom_id).toBe("faq:select");
        expect(update(interaction).content).toBe(`✅ FAQ panel posted in <#${channel.id}>.`);
    });

    test("posting the panel with no questions is refused", async () => {
        const channel = fakeChannel();
        const guild = fakeGuild({ channels: [channel] });
        const interaction = fakeInteraction({ guild, customId: "setup:faq:panel", values: [channel.id] });
        await setup.handleComponent(interaction);
        expect(channel.send).not.toHaveBeenCalled();
        expect(update(interaction).content).toBe("❌ Add some questions first.");
    });
    test("Panel text saves and Preview panel uses it", async () => {
        const guild = fakeGuild();
        addFaq(guild.id, "How?", "Like this.");
        const save = fakeInteraction({ guild, customId: "setup:faq:paneltext", fields: { title: "Help", text: "Pick:" } });
        await setup.handleModal(save);
        expect(update(save).content).toBe("✅ Panel text saved.");

        const preview = fakeInteraction({ guild, customId: "setup:faq:previewpanel" });
        await setup.handleComponent(preview);
        const reply = preview.reply.mock.calls[0][0];
        expect(reply.embeds[0].toJSON()).toMatchObject({ title: "Help", description: "Pick:\n\n• How?" });
    });
});
