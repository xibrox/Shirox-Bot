const { test, expect } = require("bun:test");
const { getPanels, findPanel, savePanel, removePanel, parseMessageLink, readPanelMessage } = require("../lib/selfRolePanels");
const { buildSelfRolePanel } = require("../lib/selfRoles");
const { fakeGuild, fakeRole } = require("./fakes");

test("panels are saved, replaced by message id, and removed", () => {
    const { id } = fakeGuild();
    savePanel(id, { messageId: "m1", channelId: "c1", title: "A", description: null, roleIds: ["r1"] });
    savePanel(id, { messageId: "m1", channelId: "c1", title: "B", description: null, roleIds: ["r1", "r2"] });
    expect(getPanels(id)).toHaveLength(1);
    expect(findPanel(id, "m1").title).toBe("B");
    removePanel(id, "m1");
    expect(getPanels(id)).toEqual([]);
});

test("message links are parsed, including ptb and canary", () => {
    expect(parseMessageLink("https://discord.com/channels/1/2/3")).toEqual({ guildId: "1", channelId: "2", messageId: "3" });
    expect(parseMessageLink(" https://canary.discord.com/channels/1/2/3 ")).toEqual({ guildId: "1", channelId: "2", messageId: "3" });
    expect(parseMessageLink("https://ptb.discordapp.com/channels/1/2/3")).toEqual({ guildId: "1", channelId: "2", messageId: "3" });
    expect(parseMessageLink("https://example.com/channels/1/2/3")).toBeNull();
    expect(parseMessageLink("hello")).toBeNull();
});

// A posted panel as discord.js returns it: embeds with title/description, rows of buttons with customId
function postedMessage(payload, authorId = "bot") {
    const embed = payload.embeds[0].toJSON();
    return {
        id: "m9",
        channelId: "c9",
        author: { id: authorId },
        embeds: [{ title: embed.title, description: embed.description }],
        components: payload.components.map(row => ({ components: row.toJSON().components.map(c => ({ customId: c.custom_id })) })),
    };
}

test("an existing panel is read back from its message", () => {
    const roles = [fakeRole("r1"), fakeRole("r2")];
    const message = postedMessage(buildSelfRolePanel("Colors", "Pick a color", roles));
    expect(readPanelMessage(message, "bot")).toEqual({
        messageId: "m9", channelId: "c9", title: "Colors", description: "Pick a color", roleIds: ["r1", "r2"],
    });
});

test("the default description is read back as null", () => {
    const message = postedMessage(buildSelfRolePanel("Colors", null, [fakeRole("r1")]));
    expect(readPanelMessage(message, "bot").description).toBeNull();
});

test("messages from others or without role buttons are not panels", () => {
    const panel = buildSelfRolePanel("Colors", null, [fakeRole("r1")]);
    expect(readPanelMessage(postedMessage(panel, "someone"), "bot")).toBeNull();
    expect(readPanelMessage({ ...postedMessage(panel), components: [] }, "bot")).toBeNull();
});
