const { describe, test, expect } = require("bun:test");
const { PermissionFlagsBits: P, MessageFlags } = require("discord.js");
const mod = require("../commands/mod");
const { VIEWS } = require("../lib/mod/views");
const { addWarning } = require("../lib/warnings");
const { recordAction } = require("../lib/modHistory");
const { fakeGuild, fakeMember, fakeUser, fakeInteraction } = require("./fakes");
const { rowsOf, expectWithinDiscordLimits } = require("./limits");

const MOD_IDS = /^mod:/;
const reply = interaction => interaction.reply.mock.calls[0][0];
const update = interaction => interaction.update.mock.calls.at(-1)[0];
const customIds = payload => rowsOf(payload).flatMap(row => row.components.map(c => c.custom_id));

// Users the bot can look up by id
function withUsers(interaction, ...users) {
    interaction.client.users = { fetch: async id => users.find(u => u.id === id) ?? Promise.reject(new Error("Unknown User")) };
    return interaction;
}

// Every "mod:" id must reach a view action
function expectRoutable(payload) {
    for (const id of customIds(payload)) {
        const [, viewId, action] = id.split(":");
        expect(VIEWS[viewId]?.actions).toHaveProperty(action);
    }
}

describe("/mod", () => {
    test("opens the home view privately", async () => {
        const interaction = fakeInteraction();
        await mod.execute(interaction);
        expect(reply(interaction).flags).toBe(MessageFlags.Ephemeral);
        expect(reply(interaction).embeds[0].toJSON().title).toBe("🛡️ Moderation · Test Server");
        expectWithinDiscordLimits(reply(interaction), MOD_IDS);
        expectRoutable(reply(interaction));
    });

    test("home only shows buttons the member may use", async () => {
        const interaction = fakeInteraction({ permissions: P.ModerateMembers });
        await mod.execute(interaction);
        const ids = customIds(reply(interaction));
        expect(ids).toContain("mod:history:show");
        expect(ids).not.toContain("mod:bans:show");
        expect(ids).not.toContain("mod:channel:show");
    });
});

describe("routing", () => {
    test("unknown views and actions say the panel is out of date", async () => {
        for (const customId of ["mod:nope:x", "mod:home:nope"]) {
            const interaction = fakeInteraction({ customId });
            await mod.handleComponent(interaction);
            expect(reply(interaction).content).toBe("⚠️ This panel is out of date. Run /mod again.");
        }
    });

    test("actions re-check their permission", async () => {
        const interaction = fakeInteraction({ permissions: P.ModerateMembers, customId: "mod:bans:show" });
        await mod.handleComponent(interaction);
        expect(reply(interaction).content).toBe("❌ You need **Ban Members** for this.");
    });
});

describe("user view", () => {
    test("picking a member shows their info, warnings and history", async () => {
        const member = fakeMember();
        const guild = fakeGuild({ members: [member] });
        addWarning(guild.id, member.id, "first warning", "m1");
        recordAction(guild.id, { type: "warn", targetId: member.id, moderatorId: "m1", reason: "first warning" });
        const interaction = withUsers(fakeInteraction({ guild, customId: "mod:home:user", values: [member.id] }), member.user);
        await mod.handleComponent(interaction);
        const json = update(interaction).embeds[0].toJSON();
        expect(json.author.name).toBe(member.user.tag);
        expect(json.fields.find(f => f.name === "Warnings").value).toStartWith("1\n");
        expect(json.fields.find(f => f.name === "Recent history").value).toContain("**warn**");
        expectWithinDiscordLimits(update(interaction), MOD_IDS);
        expectRoutable(update(interaction));
    });

    test("User by ID finds people who aren't in the server", async () => {
        const user = fakeUser("123456789012345678");
        const guild = fakeGuild({ bans: [user.id] });
        const interaction = withUsers(fakeInteraction({ guild, customId: "mod:home:byid", fields: { id: user.id } }), user);
        await mod.handleModal(interaction);
        const payload = update(interaction);
        expect(payload.embeds[0].toJSON().description).toContain("Not in this server");
        expect(customIds(payload)).toContain(`mod:user:unban:${user.id}`);
        expect(customIds(payload)).not.toContain(`mod:user:kick:${user.id}`);
    });

    test("an unknown id gets a notice", async () => {
        for (const id of ["abc", "123456789012345678"]) {
            const interaction = withUsers(fakeInteraction({ customId: "mod:home:byid", fields: { id } }));
            await mod.handleModal(interaction);
            expect(update(interaction).content).toBe("❌ I can't find a user with that ID.");
        }
    });

    test("stays within limits with many long warnings and history entries", async () => {
        const member = fakeMember({ timedOutUntil: Date.now() + 60_000 });
        const guild = fakeGuild({ members: [member] });
        for (let i = 0; i < 30; i++) {
            addWarning(guild.id, member.id, "r".repeat(400), "m1");
            recordAction(guild.id, { type: "warn", targetId: member.id, moderatorId: "m1", reason: "r".repeat(400) });
        }
        const interaction = withUsers(fakeInteraction({ guild, customId: "mod:home:user", values: [member.id] }), member.user);
        await mod.handleComponent(interaction);
        expectWithinDiscordLimits(update(interaction), MOD_IDS);
        expect(customIds(update(interaction))).toContain(`mod:user:untimeout:${member.id}`);
    });
});
