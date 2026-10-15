const { test, expect, mock } = require("bun:test");
const { Collection, AuditLogEvent, PermissionFlagsBits: P, PermissionsBitField } = require("discord.js");
const [banAdd] = require("../events/bans");
const memberLeave = require("../events/memberLeave");
const memberUpdate = require("../events/memberUpdate");
const honeypotEvent = require("../events/honeypot");
const { getHistory } = require("../lib/modHistory");
const { suppressLogsFor } = require("../lib/logger");
const { updateGuildConfig } = require("../lib/guildConfig");
const { fakeGuild, fakeUser, fakeMember } = require("./fakes");

// Audit log that only has an entry for `type`
function withAudit(guild, type, entry) {
    guild.fetchAuditLogs = mock(async ({ type: asked }) =>
        ({ entries: new Collection(asked === type ? [["1", { createdTimestamp: Date.now(), ...entry }]] : []) }));
    return guild;
}

test("a ban records the moderator and reason from the audit log", async () => {
    const guild = withAudit(fakeGuild(), AuditLogEvent.MemberBanAdd, { targetId: "u1", executor: { id: "mod1" }, reason: "spam" });
    await banAdd.execute({ guild, user: fakeUser("u1"), reason: null });
    expect(getHistory(guild.id)[0]).toMatchObject({ type: "ban", targetId: "u1", moderatorId: "mod1", reason: "spam" });
});

test("without audit log access the moderator is unknown", async () => {
    const guild = fakeGuild({ botPermissions: P.BanMembers });
    await banAdd.execute({ guild, user: fakeUser("u1"), reason: "raid" });
    expect(getHistory(guild.id)[0]).toMatchObject({ type: "ban", moderatorId: null, reason: "raid" });
});

test("a softban's ban event is not recorded again", async () => {
    const guild = fakeGuild();
    suppressLogsFor("u2");
    await banAdd.execute({ guild, user: fakeUser("u2"), reason: null });
    expect(getHistory(guild.id)).toEqual([]);
});

test("a kick is recorded when a member leaves", async () => {
    const member = fakeMember({ id: "u3" });
    const guild = withAudit(fakeGuild(), AuditLogEvent.MemberKick, { targetId: "u3", executor: { id: "mod1" }, reason: "rude" });
    member.guild = guild;
    await memberLeave.execute(member);
    expect(getHistory(guild.id)[0]).toMatchObject({ type: "kick", targetId: "u3", moderatorId: "mod1", reason: "rude" });
});

test("a timeout is recorded", async () => {
    const guild = fakeGuild({ botPermissions: P.ModerateMembers });
    const base = { partial: false, nickname: null, roles: { cache: new Collection() } };
    const until = Date.now() + 60_000;
    await memberUpdate.execute(
        { ...base, communicationDisabledUntilTimestamp: null },
        { ...base, guild, id: "u4", user: fakeUser("u4"), communicationDisabledUntilTimestamp: until },
    );
    expect(getHistory(guild.id)[0]).toMatchObject({ type: "timeout", targetId: "u4", moderatorId: null, extra: { until } });
});

test("a honeypot catch is recorded with the bot as moderator", async () => {
    const guild = fakeGuild();
    updateGuildConfig(guild.id, { honeypotChannelId: "trap", honeypotAction: "softban" });
    const member = { ...fakeMember({ id: "u5" }), permissions: new PermissionsBitField(0n) };
    await honeypotEvent.execute({
        id: "m1",
        inGuild: () => true,
        author: fakeUser("u5"),
        guild,
        channelId: "trap",
        member,
        content: "free nitro",
        client: { user: { id: "bot" } },
        delete: mock(async () => {}),
    });
    expect(getHistory(guild.id)[0]).toMatchObject({ type: "honeypot", targetId: "u5", moderatorId: "bot", extra: { action: "softban" } });
});
