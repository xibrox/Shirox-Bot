const { describe, test, expect, mock } = require("bun:test");
const { MessageFlags } = require("discord.js");
const actions = require("../lib/modActions");
const { getWarnings } = require("../lib/warnings");
const { getHistory } = require("../lib/modHistory");
const { fakeGuild, fakeUser, fakeMember, fakeInteraction } = require("./fakes");

describe("warnUser", () => {
    test("warns, records and returns the public line", async () => {
        const interaction = fakeInteraction();
        const user = fakeUser();
        const result = await actions.warnUser(interaction, user, "spam");
        expect(result.publicLine).toBe(`⚠️ Warned **${user.tag}** (warning #1, 1 total). Reason: spam`);
        expect(getWarnings(interaction.guild.id, user.id)).toHaveLength(1);
        expect(user.send).toHaveBeenCalled();
        expect(getHistory(interaction.guild.id)[0]).toMatchObject({ type: "warn", targetId: user.id, moderatorId: "moderator", reason: "spam" });
    });

    test("notes when the DM fails", async () => {
        const user = fakeUser();
        user.send = mock(async () => { throw new Error("DMs closed"); });
        const result = await actions.warnUser(fakeInteraction(), user, "spam");
        expect(result.publicLine).toEndWith("\n*(Couldn't DM them.)*");
    });

    test("refuses bots and yourself", async () => {
        expect(await actions.warnUser(fakeInteraction(), fakeUser(undefined, { bot: true }), "x")).toEqual({ error: "❌ You can't warn bots." });
        expect(await actions.warnUser(fakeInteraction(), fakeUser("moderator"), "x")).toEqual({ error: "❌ You can't warn yourself." });
    });
});

describe("timeoutMember", () => {
    test("times out for a duration", async () => {
        const member = fakeMember();
        const result = await actions.timeoutMember(fakeInteraction(), member, "10m", "spam");
        expect(member.timeout).toHaveBeenCalledWith(600_000, "mod#0001: spam");
        expect(result.publicLine).toBe(`🔇 Timed out **${member.user.tag}** for **10m**. Reason: spam`);
    });

    test("off removes the timeout", async () => {
        const member = fakeMember();
        const result = await actions.timeoutMember(fakeInteraction(), member, "off", "done");
        expect(member.timeout).toHaveBeenCalledWith(null, "mod#0001: done");
        expect(result.publicLine).toBe(`🔊 Removed timeout from **${member.user.tag}**.`);
    });

    test("refuses bad input and members it can't act on", async () => {
        const i = fakeInteraction();
        expect(await actions.timeoutMember(i, null, "10m", "x")).toEqual({ error: "❌ That user is not in this server." });
        expect(await actions.timeoutMember(i, fakeMember(), "5x", "x")).toEqual({ error: "⏰ Invalid duration. Examples: `10m`, `1h`, `2d`." });
        expect(await actions.timeoutMember(i, fakeMember(), "29d", "x")).toEqual({ error: "⚠️ The maximum timeout is 28 days." });
        expect(await actions.timeoutMember(i, fakeMember({ moderatable: false }), "1m", "x")).toEqual({ error: "❌ I can't timeout that member." });
        expect(await actions.timeoutMember(i, fakeMember({ position: 60 }), "1m", "x"))
            .toEqual({ error: "❌ That member's highest role is equal to or above yours." });
    });
});

describe("kickMember", () => {
    test("DMs, kicks and returns the public line", async () => {
        const member = fakeMember();
        const result = await actions.kickMember(fakeInteraction(), member, "rude");
        expect(member.send).toHaveBeenCalledWith("👢 You were kicked from **Test Server**. Reason: rude");
        expect(member.kick).toHaveBeenCalledWith("mod#0001: rude");
        expect(result.publicLine).toBe(`👢 Kicked **${member.user.tag}**. Reason: rude`);
    });

    test("refuses members it can't kick", async () => {
        expect(await actions.kickMember(fakeInteraction(), fakeMember({ kickable: false }), "x")).toEqual({ error: "❌ I can't kick that member." });
    });
});

describe("banUser", () => {
    test("bans a member", async () => {
        const member = fakeMember();
        const interaction = fakeInteraction();
        const result = await actions.banUser(interaction, member.user, member, "raid", 3600);
        expect(interaction.guild.members.ban).toHaveBeenCalledWith(member.user, { reason: "mod#0001: raid", deleteMessageSeconds: 3600 });
        expect(result.publicLine).toBe(`🔨 Banned **${member.user.tag}**. Reason: raid`);
    });

    test("bans someone who isn't in the server", async () => {
        const user = fakeUser();
        const interaction = fakeInteraction();
        await actions.banUser(interaction, user, null, "raid");
        expect(interaction.guild.members.ban).toHaveBeenCalledWith(user, { reason: "mod#0001: raid", deleteMessageSeconds: 0 });
    });

    test("reports a failed ban", async () => {
        const interaction = fakeInteraction();
        interaction.guild.members.ban = mock(async () => { throw new Error("Missing Permissions"); });
        expect(await actions.banUser(interaction, fakeUser(), null, "x")).toEqual({ error: "❌ Failed to ban that user. Do I have **Ban Members**?" });
    });
});

describe("softbanMember", () => {
    test("bans, unbans and records one softban", async () => {
        const member = fakeMember();
        const interaction = fakeInteraction();
        const result = await actions.softbanMember(interaction, member, "spam");
        expect(interaction.guild.members.ban).toHaveBeenCalled();
        expect(interaction.guild.members.unban).toHaveBeenCalled();
        expect(result.publicLine).toBe(`🧹 Soft banned **${member.user.tag}**. Reason: spam`);
        expect(getHistory(interaction.guild.id).map(e => e.type)).toEqual(["softban"]);
    });
});

describe("unbanUser", () => {
    test("unbans a banned user", async () => {
        const interaction = fakeInteraction({ guild: fakeGuild({ bans: ["123456789012345678"] }) });
        expect(await actions.unbanUser(interaction, "123456789012345678", "appeal"))
            .toEqual({ publicLine: "✅ Unbanned **user#123456789012345678**." });
    });

    test("refuses bad ids and users who aren't banned", async () => {
        expect(await actions.unbanUser(fakeInteraction(), "abc", "x")).toEqual({ error: "❌ That is not a valid user ID." });
        expect(await actions.unbanUser(fakeInteraction(), "123456789012345678", "x"))
            .toEqual({ error: "❌ Couldn't unban that user. They may not be banned." });
    });
});

describe("helpers", () => {
    test("replyResult shows errors privately and results publicly", async () => {
        const failed = fakeInteraction();
        await actions.replyResult(failed, { error: "❌ no" });
        expect(failed.reply).toHaveBeenCalledWith({ content: "❌ no", flags: MessageFlags.Ephemeral });

        const done = fakeInteraction();
        await actions.replyResult(done, { publicLine: "🔨 Banned" });
        expect(done.reply).toHaveBeenCalledWith({ content: "🔨 Banned", allowedMentions: { parse: [] } });
    });

    test("parseDeleteWindow accepts the four ban choices", () => {
        expect(["", "0", "1h", "24h", "7d", " 7D "].map(actions.parseDeleteWindow)).toEqual([0, 0, 3600, 86400, 604800, 604800]);
        expect(actions.parseDeleteWindow("3d")).toBeNull();
    });
});
