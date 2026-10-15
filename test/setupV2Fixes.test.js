const { describe, test, expect, mock } = require("bun:test");
const setup = require("../commands/setup");
const welcomeCommand = require("../commands/welcome");
const messageLogs = require("../events/messageLogs");
const { addFaq, faqPanel } = require("../lib/faq");
const { readPanelMessage, savePanel, findPanel } = require("../lib/selfRolePanels");
const { buildSelfRolePanel } = require("../lib/selfRoles");
const { updateGuildConfig } = require("../lib/guildConfig");
const { fakeGuild, fakeChannel, fakeRole, fakeInteraction } = require("./fakes");
const { rowsOf } = require("./limits");

const update = interaction => interaction.update.mock.calls.at(-1)[0];

async function click(guild, customId, extra = {}) {
    const interaction = fakeInteraction({ guild, customId, ...extra });
    await setup.handleComponent(interaction);
    return interaction;
}

async function newDraft(guild) {
    const start = await click(guild, "setup:selfroles:new");
    const ids = rowsOf(update(start)).flatMap(row => row.components.map(c => c.custom_id));
    return { start, draftId: ids.find(id => id.startsWith("setup:selfroles:post:")).split(":")[3] };
}

// Discord rejects forms whose title, labels or placeholders are too long
function expectModalWithinLimits(modal) {
    const json = modal.toJSON();
    expect(json.title.length).toBeLessThanOrEqual(45);
    for (const row of json.components) {
        for (const input of row.components) {
            expect(input.label.length).toBeLessThanOrEqual(45);
            if (input.placeholder) expect(input.placeholder.length).toBeLessThanOrEqual(100);
        }
    }
}

test("every form the dashboard opens fits Discord's limits", async () => {
    const guild = fakeGuild();
    const faq = addFaq(guild.id, "Q?", "A.");
    savePanel(guild.id, { messageId: "m1", channelId: "c1", title: "T", description: "D", roleIds: [] });
    const { draftId } = await newDraft(guild);
    const ids = [
        "setup:welcome:text", "setup:goodbye:text", "setup:honeypot:text", "setup:automod:limits", "setup:automod:allow", "setup:joinwhitelist:add", "setup:prefix:change",
        "setup:faq:add", `setup:faq:edit:${faq.id}`, "setup:faq:paneltext",
        "setup:selfroles:adopt", `setup:selfroles:newtext:${draftId}`, "setup:selfroles:text:m1",
    ];
    for (const customId of ids) {
        const interaction = await click(guild, customId);
        expect(interaction.showModal).toHaveBeenCalled();
        expectModalWithinLimits(interaction.showModal.mock.calls[0][0]);
    }
});

describe("self-role panels that can't be reached", () => {
    function guildWithPanel(fetch) {
        const role = fakeRole();
        const channel = fakeChannel("c7");
        channel.messages = { fetch };
        const guild = fakeGuild({ channels: [channel], roles: [role] });
        savePanel(guild.id, { messageId: "m7", channelId: "c7", title: "T", description: null, roleIds: [role.id] });
        return { guild, role };
    }

    test("a panel the bot can't read is kept, not dropped", async () => {
        const { guild, role } = guildWithPanel(mock(async () => { throw Object.assign(new Error("Missing Access"), { code: 50001 }); }));
        const interaction = await click(guild, "setup:selfroles:roles:m7", { values: [role.id] });
        expect(findPanel(guild.id, "m7")).not.toBeNull();
        expect(update(interaction).content).toBe("❌ I couldn't reach that panel's message. Check that I can see its channel.");
    });

    test("a panel in a channel that isn't cached is still edited", async () => {
        const role = fakeRole();
        const message = { id: "m8", edit: mock(async () => {}), delete: mock(async () => {}) };
        const channel = { id: "c8", messages: { fetch: mock(async () => message) } };
        const guild = fakeGuild({ roles: [role] });
        guild.channels.fetch = mock(async () => channel);
        savePanel(guild.id, { messageId: "m8", channelId: "c8", title: "T", description: null, roleIds: [role.id] });
        const interaction = await click(guild, "setup:selfroles:roles:m8", { values: [role.id] });
        expect(message.edit).toHaveBeenCalled();
        expect(update(interaction).content).toBe("✅ Panel updated.");
    });

    test("a failed delete keeps the panel and says so", async () => {
        const message = { id: "m7", edit: mock(async () => {}), delete: mock(async () => { throw Object.assign(new Error("Missing Permissions"), { code: 50013 }); }) };
        const { guild } = guildWithPanel(mock(async () => message));
        const interaction = await click(guild, "setup:selfroles:confirmdelete:m7");
        expect(findPanel(guild.id, "m7")).not.toBeNull();
        expect(update(interaction).content).toBe("❌ I couldn't delete that panel's message.");
    });

    test("roles that were deleted are dropped when the panel is saved", async () => {
        const { guild, role } = guildWithPanel(mock(async () => ({ id: "m7", edit: mock(async () => {}) })));
        savePanel(guild.id, { messageId: "m7", channelId: "c7", title: "T", description: null, roleIds: [role.id, "gone"] });
        const interaction = fakeInteraction({ guild, customId: "setup:selfroles:text:m7", fields: { title: "New", description: "" } });
        await setup.handleModal(interaction);
        expect(findPanel(guild.id, "m7").roleIds).toEqual([role.id]);
    });
});

describe("new panel drafts", () => {
    test("Post can't post twice when double-clicked", async () => {
        const channel = fakeChannel();
        channel.send = mock(async () => ({ id: "posted", channelId: channel.id }));
        const role = fakeRole();
        const guild = fakeGuild({ channels: [channel], roles: [role] });
        const { draftId } = await newDraft(guild);
        await click(guild, `setup:selfroles:newchannel:${draftId}`, { values: [channel.id] });
        await click(guild, `setup:selfroles:newroles:${draftId}`, { values: [role.id] });
        await setup.handleModal(fakeInteraction({ guild, customId: `setup:selfroles:newtext:${draftId}`, fields: { title: "T", description: "" } }));
        await Promise.all([click(guild, `setup:selfroles:post:${draftId}`), click(guild, `setup:selfroles:post:${draftId}`)]);
        expect(channel.send).toHaveBeenCalledTimes(1);
    });

    test("the new panel starts in this channel only if the bot can post there", async () => {
        const here = fakeChannel("here");
        const { start } = await newDraft(fakeGuild({ channels: [here] }));
        expect(update(start).embeds[0].toJSON().description).toContain("**Channel:** <#here>");

        const { start: elsewhere } = await newDraft(fakeGuild());
        expect(update(elsewhere).embeds[0].toJSON().description).toContain("**Channel:** *not set*");
    });
});

test("a long FAQ panel text still fits in the embed", () => {
    const faqs = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, question: `${i} ${"q".repeat(198)}` }));
    const description = faqPanel(faqs, { text: "t".repeat(2000) }).embeds[0].toJSON().description;
    expect(description.length).toBeLessThanOrEqual(4096);
    expect(description).toEndWith("…");
});

test("bot messages with the newer component layout aren't mistaken for panels", () => {
    expect(readPanelMessage({ author: { id: "bot" }, components: [{ type: 10, content: "hi" }], embeds: [] }, "bot")).toBeNull();
});

test("images aren't cached for logs while message logs are off", async () => {
    const guild = fakeGuild();
    updateGuildConfig(guild.id, { logChannelId: "logs", logTypesOff: ["messages"] });
    const values = mock(() => [].values());
    await messageLogs[0].execute({
        inGuild: () => true,
        author: { bot: false },
        attachments: { size: 1, values },
        guild: { id: guild.id },
        channel: { id: "general", guild: { id: guild.id } },
    });
    expect(values).not.toHaveBeenCalled();
});

test("/welcome show includes the custom title", async () => {
    const interaction = fakeInteraction();
    updateGuildConfig(interaction.guild.id, { welcomeChannelId: "c1", welcomeTitle: "Hey {user}" });
    interaction.options = { getSubcommand: () => "show" };
    await welcomeCommand.execute(interaction);
    expect(interaction.reply.mock.calls[0][0].content).toContain("🏷️ Title: Hey {user}");
});
