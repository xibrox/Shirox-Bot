const { describe, test, expect } = require("bun:test");
const actions = require("../lib/modActions");
const { getHistory } = require("../lib/modHistory");
const { fakeRole, fakeMember, fakeTextChannel, fakeInteraction } = require("./fakes");

describe("setNickname", () => {
    test("sets and resets a nickname", async () => {
        const member = fakeMember();
        expect(await actions.setNickname(fakeInteraction(), member, "Bob"))
            .toEqual({ publicLine: `✏️ Changed **${member.user.tag}**'s nickname to **Bob**.` });
        expect(member.setNickname).toHaveBeenCalledWith("Bob", "By mod#0001");
        expect(await actions.setNickname(fakeInteraction(), member, null)).toEqual({ publicLine: `✏️ Reset **${member.user.tag}**'s nickname.` });
    });

    test("refuses members it can't manage", async () => {
        expect(await actions.setNickname(fakeInteraction(), fakeMember({ manageable: false }), "x"))
            .toEqual({ error: "❌ I can't change that member's nickname." });
        expect(await actions.setNickname(fakeInteraction(), null, "x")).toEqual({ error: "❌ That user is not in this server." });
    });
});

describe("changeRoles", () => {
    test("gives only the roles the member doesn't have yet", async () => {
        const [a, b] = [fakeRole(), fakeRole()];
        const member = fakeMember({ roles: [a] });
        const result = await actions.changeRoles(fakeInteraction(), member, [a, b], true);
        expect(member.roles.add).toHaveBeenCalledWith([b], "By mod#0001");
        expect(result.publicLine).toBe(`✅ Gave <@&${b.id}> to <@${member.id}>.`);
    });

    test("a single role keeps /role's messages", async () => {
        const role = fakeRole();
        const member = fakeMember({ roles: [role] });
        expect(await actions.changeRoles(fakeInteraction(), member, [role], true)).toEqual({ error: `<@${member.id}> already has <@&${role.id}>.` });
        expect(await actions.changeRoles(fakeInteraction(), fakeMember(), [role], false)).toEqual({ error: expect.stringContaining("doesn't have") });
    });

    test("roles the bot can't assign are refused", async () => {
        const result = await actions.changeRoles(fakeInteraction(), fakeMember(), [fakeRole(undefined, { position: 200 })], true);
        expect(result.error).toContain("equal to or above my highest role");
    });
});

describe("purgeMessages", () => {
    test("deletes an amount and records it", async () => {
        const channel = fakeTextChannel();
        const interaction = fakeInteraction();
        const result = await actions.purgeMessages(interaction, channel, 5, null);
        expect(channel.bulkDelete).toHaveBeenCalledWith(5, true);
        expect(result).toEqual({ notice: `✅ Deleted **5** message(s) in <#${channel.id}>.` });
        expect(getHistory(interaction.guild.id)[0]).toMatchObject({ type: "purge", extra: { count: 5, channelId: channel.id } });
    });

    test("can delete only one user's messages", async () => {
        const messages = [{ id: "1", author: { id: "u1" } }, { id: "2", author: { id: "u2" } }, { id: "3", author: { id: "u1" } }];
        const channel = fakeTextChannel(undefined, { messages });
        const result = await actions.purgeMessages(fakeInteraction(), channel, 10, "u1");
        expect(channel.bulkDelete.mock.calls[0][0].map(m => m.id)).toEqual(["1", "3"]);
        expect(result.notice).toStartWith("✅ Deleted **2** message(s)");
    });
});

describe("setLock", () => {
    test("locks and unlocks for @everyone", async () => {
        const channel = fakeTextChannel();
        const interaction = fakeInteraction();
        expect(await actions.setLock(interaction, channel, true, "raid")).toEqual({ publicLine: "🔒 Channel locked. Reason: raid" });
        expect(channel.permissionOverwrites.edit).toHaveBeenCalledWith(
            interaction.guild.roles.everyone, { SendMessages: false, SendMessagesInThreads: false }, { reason: "mod#0001: raid" },
        );
        expect(await actions.setLock(interaction, channel, false, null)).toEqual({ publicLine: "🔓 Channel unlocked." });
        expect(getHistory(interaction.guild.id).map(e => e.type)).toEqual(["unlock", "lock"]);
    });
});

describe("setSlowmode", () => {
    test("sets, disables and refuses bad durations", async () => {
        const channel = fakeTextChannel();
        expect(await actions.setSlowmode(fakeInteraction(), channel, "1m")).toEqual({ publicLine: "🐢 Slowmode set to **1m**." });
        expect(channel.setRateLimitPerUser).toHaveBeenCalledWith(60, "Set by mod#0001");
        expect(await actions.setSlowmode(fakeInteraction(), channel, "off")).toEqual({ publicLine: "✅ Slowmode disabled." });
        expect(await actions.setSlowmode(fakeInteraction(), channel, "soon")).toEqual({ error: "⏰ Invalid duration. Examples: `5s`, `1m`, `off`." });
        expect(await actions.setSlowmode(fakeInteraction(), channel, "7h")).toEqual({ error: "⚠️ The maximum slowmode is 6 hours." });
    });
});
