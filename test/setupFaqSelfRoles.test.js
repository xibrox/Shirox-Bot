const { describe, test, expect } = require("bun:test");
const setup = require("../commands/setup");
const { addFaq, getFaqs } = require("../lib/faq");
const { fakeGuild, fakeChannel, fakeRole, fakeInteraction } = require("./fakes");

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

describe("self roles section", () => {
    test("picked roles go into the form, and submitting posts the panel here", async () => {
        const roles = [fakeRole(), fakeRole()];
        const guild = fakeGuild({ roles });
        const pick = fakeInteraction({ guild, customId: "setup:selfroles:roles", values: roles.map(r => r.id) });
        await setup.handleComponent(pick);
        const customId = pick.showModal.mock.calls[0][0].toJSON().custom_id;
        expect(customId).toStartWith("setup:selfroles:post:");

        const submit = fakeInteraction({ guild, customId, fields: { title: "Pick roles", description: "" } });
        await setup.handleModal(submit);
        const panel = submit.channel.send.mock.calls[0][0];
        expect(panel.components[0].toJSON().components.map(b => b.custom_id)).toEqual(roles.map(r => `selfrole:${r.id}`));
        expect(update(submit).content).toBe("✅ Self-role panel posted.");
    });

    test("roles the bot can't assign are refused before the form", async () => {
        const role = fakeRole(undefined, { position: 200 });
        const guild = fakeGuild({ roles: [role] });
        const interaction = fakeInteraction({ guild, customId: "setup:selfroles:roles", values: [role.id] });
        await setup.handleComponent(interaction);
        expect(interaction.showModal).not.toHaveBeenCalled();
        expect(update(interaction).content).toContain("equal to or above my highest role");
    });

    test("an expired form says so", async () => {
        const interaction = fakeInteraction({ customId: "setup:selfroles:post:gone", fields: { title: "T" } });
        await setup.handleModal(interaction);
        expect(update(interaction).content).toBe("⌛ This preview expired. Run the command again.");
    });
});
