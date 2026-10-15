const { test, expect } = require("bun:test");
const { recordAction, getHistory, formatEntry } = require("../lib/modHistory");
const { fakeGuild } = require("./fakes");

test("entries come back newest first with a timestamp", () => {
    const { id } = fakeGuild();
    recordAction(id, { type: "warn", targetId: "u1", moderatorId: "m1", reason: "first" });
    recordAction(id, { type: "kick", targetId: "u2", moderatorId: "m1", reason: "second" });
    const [newest, oldest] = getHistory(id);
    expect(newest).toMatchObject({ type: "kick", reason: "second" });
    expect(oldest).toMatchObject({ type: "warn", reason: "first" });
    expect(typeof newest.timestamp).toBe("number");
});

test("can be filtered by target and limited", () => {
    const { id } = fakeGuild();
    for (let i = 0; i < 5; i++) recordAction(id, { type: "warn", targetId: i % 2 ? "odd" : "even", moderatorId: "m", reason: `${i}` });
    expect(getHistory(id, { targetId: "odd" }).map(e => e.reason)).toEqual(["3", "1"]);
    expect(getHistory(id, { limit: 2 }).map(e => e.reason)).toEqual(["4", "3"]);
});

test("only the newest 500 entries are kept", () => {
    const { id } = fakeGuild();
    for (let i = 0; i < 510; i++) recordAction(id, { type: "warn", targetId: "u", moderatorId: "m", reason: `${i}` });
    const all = getHistory(id, { limit: 1000 });
    expect(all).toHaveLength(500);
    expect(all.at(-1).reason).toBe("10");
});

test("entries format as one readable line", () => {
    const line = formatEntry({ type: "ban", targetId: "u1", moderatorId: "m1", reason: "x".repeat(300), timestamp: 1_700_000_000_000 });
    expect(line).toStartWith("🔨 **ban** · <@u1> · by <@m1> · ");
    expect(line).toEndWith("<t:1700000000:R>");
    expect(line.length).toBeLessThanOrEqual(260);
    expect(formatEntry({ type: "lock", targetId: null, moderatorId: null, reason: null, timestamp: 0, extra: { channelId: "c1" } }))
        .toBe("🔒 **lock** · <#c1> · by unknown · <t:0:R>");
});
