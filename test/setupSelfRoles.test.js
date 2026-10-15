const { describe, test, expect, mock } = require("bun:test");
const { MessageFlags } = require("discord.js");
const setup = require("../commands/setup");
const selfroles = require("../lib/setup/sections/selfroles");
const { getPanels, findPanel, savePanel } = require("../lib/selfRolePanels");
const { buildSelfRolePanel } = require("../lib/selfRoles");
const { fakeGuild, fakeChannel, fakeRole, fakeInteraction } = require("./fakes");
const { rowsOf, expectWithinDiscordLimits } = require("./limits");

const update = interaction => interaction.update.mock.calls.at(-1)[0];
const customIds = payload => rowsOf(payload).flatMap(row => row.components.map(c => c.custom_id));

// A channel that can post, fetch, edit and delete messages like a real one
function panelChannel() {
    const channel = fakeChannel();
    const messages = new Map();
    channel.send = mock(async () => {
        const message = { id: `msg${messages.size + 1}`, channelId: channel.id, edit: mock(async () => {}) };
        message.delete = mock(async () => { messages.delete(message.id); });
        messages.set(message.id, message);
        return message;
    });
    channel.messages = {
        fetch: mock(async id => {
            if (!messages.has(id)) throw Object.assign(new Error("Unknown Message"), { code: 10008 });
            return messages.get(id);
        }),
        delete: mock(async id => { messages.delete(id); }),
    };
    channel.stored = messages;
    return channel;
}

async function click(guild, customId, extra = {}) {
    const interaction = fakeInteraction({ guild, customId, ...extra });
    await setup.handleComponent(interaction);
    return interaction;
}

async function submit(guild, customId, fields) {
    const interaction = fakeInteraction({ guild, customId, fields });
    await setup.handleModal(interaction);
    return interaction;
}

const draftIdOf = interaction => customIds(update(interaction)).find(id => id.startsWith("setup:selfroles:post:")).split(":")[3];

describe("new panel", () => {
    test("channel, roles and text, then Post records the panel", async () => {
        const channel = panelChannel();
        const roles = [fakeRole(), fakeRole()];
        const guild = fakeGuild({ channels: [channel], roles });

        const start = await click(guild, "setup:selfroles:new");
        const draftId = draftIdOf(start);
        expect(rowsOf(update(start))[2].components.find(c => c.custom_id.includes(":post:")).disabled).toBe(true);

        await click(guild, `setup:selfroles:newchannel:${draftId}`, { values: [channel.id] });
        await click(guild, `setup:selfroles:newroles:${draftId}`, { values: roles.map(r => r.id) });
        const text = await submit(guild, `setup:selfroles:newtext:${draftId}`, { title: "Colors", description: "" });
        expect(update(text).content).toBe("✅ Text saved.");

        const post = await click(guild, `setup:selfroles:post:${draftId}`);
        expect(channel.send).toHaveBeenCalledTimes(1);
        expect(getPanels(guild.id)).toEqual([
            { messageId: "msg1", channelId: channel.id, title: "Colors", description: null, roleIds: roles.map(r => r.id) },
        ]);
        expect(update(post).content).toBe(`✅ Panel posted in <#${channel.id}>.`);
    });

    test("roles the bot can't assign are refused", async () => {
        const role = fakeRole(undefined, { position: 200 });
        const guild = fakeGuild({ roles: [role] });
        const draftId = draftIdOf(await click(guild, "setup:selfroles:new"));
        const pick = await click(guild, `setup:selfroles:newroles:${draftId}`, { values: [role.id] });
        expect(update(pick).content).toContain("equal to or above my highest role");
    });

    test("an expired draft goes back to the list", async () => {
        const interaction = await click(fakeGuild(), "setup:selfroles:post:gone");
        expect(update(interaction).content).toBe("⌛ That draft expired. Start a new panel.");
    });

    test("Preview shows the panel with disabled buttons", async () => {
        const roles = [fakeRole()];
        const guild = fakeGuild({ roles });
        const draftId = draftIdOf(await click(guild, "setup:selfroles:new"));
        await click(guild, `setup:selfroles:newroles:${draftId}`, { values: [roles[0].id] });
        await submit(guild, `setup:selfroles:newtext:${draftId}`, { title: "Colors", description: "" });
        const preview = await click(guild, `setup:selfroles:newpreview:${draftId}`);
        const reply = preview.reply.mock.calls[0][0];
        expect(reply.flags).toBe(MessageFlags.Ephemeral);
        expect(reply.components[0].toJSON().components[0].disabled).toBe(true);
    });
});

describe("editing a panel", () => {
    async function posted() {
        const channel = panelChannel();
        const roles = [fakeRole(), fakeRole(), fakeRole()];
        const guild = fakeGuild({ channels: [channel], roles });
        const message = await channel.send(buildSelfRolePanel("Colors", null, roles.slice(0, 1)));
        savePanel(guild.id, { messageId: message.id, channelId: channel.id, title: "Colors", description: null, roleIds: [roles[0].id] });
        return { guild, channel, roles, message };
    }

    test("changing roles edits the posted message and saves", async () => {
        const { guild, roles, message } = await posted();
        const interaction = await click(guild, `setup:selfroles:roles:${message.id}`, { values: roles.map(r => r.id) });
        expect(message.edit).toHaveBeenCalledTimes(1);
        expect(findPanel(guild.id, message.id).roleIds).toEqual(roles.map(r => r.id));
        expect(update(interaction).content).toBe("✅ Panel updated.");
    });

    test("Text edits the posted message", async () => {
        const { guild, message } = await posted();
        const interaction = await submit(guild, `setup:selfroles:text:${message.id}`, { title: "Colours", description: "Pick one" });
        expect(message.edit.mock.calls[0][0].embeds[0].toJSON().title).toBe("Colours");
        expect(findPanel(guild.id, message.id)).toMatchObject({ title: "Colours", description: "Pick one" });
        expect(update(interaction).content).toBe("✅ Panel updated.");
    });

    test("Delete asks first, then deletes the message and the record", async () => {
        const { guild, channel, message } = await posted();
        const ask = await click(guild, `setup:selfroles:delete:${message.id}`);
        expect(customIds(update(ask))).toContain(`setup:selfroles:confirmdelete:${message.id}`);
        expect(message.delete).not.toHaveBeenCalled();

        const confirm = await click(guild, `setup:selfroles:confirmdelete:${message.id}`);
        expect(message.delete).toHaveBeenCalled();
        expect(getPanels(guild.id)).toEqual([]);
        expect(update(confirm).content).toBe("🗑️ Deleted **Colors**.");
    });

    test("a panel whose message was deleted is removed from the list", async () => {
        const { guild, channel, roles, message } = await posted();
        channel.stored.delete(message.id);
        const interaction = await click(guild, `setup:selfroles:roles:${message.id}`, { values: [roles[0].id] });
        expect(getPanels(guild.id)).toEqual([]);
        expect(update(interaction).content).toBe("❌ That panel's message was deleted, so I removed it from the list.");
    });
});

describe("adopting an existing panel", () => {
    // Message links only contain numeric ids
    function guildWithMessage(message) {
        const channel = fakeChannel("555");
        channel.messages = { fetch: mock(async id => (id === message?.id ? message : Promise.reject(new Error("Unknown")))) };
        const guild = fakeGuild({ channels: [channel] });
        guild.id = "4242";
        return guild;
    }

    const oldPanel = (authorId = "bot") => {
        const payload = buildSelfRolePanel("Old", "Legacy", [fakeRole("r7")]);
        return {
            id: "5555",
            channelId: "555",
            author: { id: authorId },
            embeds: [payload.embeds[0].toJSON()],
            components: payload.components.map(row => ({ components: row.toJSON().components.map(c => ({ customId: c.custom_id })) })),
        };
    };

    test("a link to the bot's panel adds it and opens it", async () => {
        const guild = guildWithMessage(oldPanel());
        const interaction = await submit(guild, "setup:selfroles:adopt", { link: "https://discord.com/channels/4242/555/5555" });
        expect(findPanel(guild.id, "5555")).toEqual({ messageId: "5555", channelId: "555", title: "Old", description: "Legacy", roleIds: ["r7"] });
        expect(update(interaction).content).toBe("✅ Added **Old** to the list.");
    });

    test("bad links get a notice", async () => {
        const guild = guildWithMessage(oldPanel("someone"));
        const cases = [
            ["not a link", "❌ That link isn't a message in this server."],
            ["https://discord.com/channels/999/555/5555", "❌ That link isn't a message in this server."],
            ["https://discord.com/channels/4242/555/1111", "❌ I can't find that message."],
            ["https://discord.com/channels/4242/555/5555", "❌ That isn't a self-role panel I posted."],
        ];
        for (const [link, notice] of cases) {
            const interaction = await submit(guild, "setup:selfroles:adopt", { link });
            expect(update(interaction).content).toBe(notice);
        }
    });
});

describe("views", () => {
    test("new, edit and delete-confirm views stay within Discord limits", async () => {
        const channel = panelChannel();
        const roles = Array.from({ length: 25 }, () => fakeRole());
        const guild = fakeGuild({ channels: [channel], roles });
        savePanel(guild.id, { messageId: "m1", channelId: channel.id, title: "x".repeat(200), description: "d", roleIds: roles.map(r => r.id) });
        const interaction = fakeInteraction({ guild });

        const start = await click(guild, "setup:selfroles:new");
        expectWithinDiscordLimits(update(start));
        expectWithinDiscordLimits(selfroles.view(interaction, undefined, { messageId: "m1" }));
        expectWithinDiscordLimits(selfroles.view(interaction, undefined, { messageId: "m1", confirmDelete: true }));
    });
});
