const { describe, test, expect } = require("bun:test");
const mod = require("../commands/mod");
const { recordAction } = require("../lib/modHistory");
const { fakeGuild, fakeTextChannel, fakeInteraction } = require("./fakes");
const { rowsOf, expectWithinDiscordLimits } = require("./limits");

const MOD_IDS = /^mod:/;
const update = interaction => interaction.update.mock.calls.at(-1)[0];

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

describe("bans view", () => {
    test("lists bans and opens a banned user", async () => {
        const ids = Array.from({ length: 30 }, (_, i) => `10000000000000000${String(i).padStart(2, "0")}`);
        const guild = fakeGuild({ bans: ids });
        const interaction = fakeInteraction({ guild, customId: "mod:bans:show" });
        await mod.handleComponent(interaction);
        const payload = update(interaction);
        expectWithinDiscordLimits(payload, MOD_IDS);
        expect(payload.embeds[0].toJSON().title).toBe("🚫 Bans (30)");
        expect(rowsOf(payload)[0].components[0]).toMatchObject({ custom_id: "mod:user:show" });
    });
});

describe("channel tools", () => {
    function withChannel(options) {
        const channel = fakeTextChannel(undefined, options);
        const guild = fakeGuild({ channels: [channel] });
        const make = (customId, extra = {}) => {
            const interaction = fakeInteraction({ guild, customId, ...extra });
            interaction.channel = channel;
            interaction.channelId = channel.id;
            return interaction;
        };
        return { channel, guild, make };
    }

    test("opens on the current channel and shows its state", async () => {
        const { make } = withChannel({ locked: true, slowmode: 60 });
        const interaction = make("mod:channel:show");
        await mod.handleComponent(interaction);
        const payload = update(interaction);
        expectWithinDiscordLimits(payload, MOD_IDS);
        expect(payload.embeds[0].toJSON().description).toContain("**Locked:** yes");
        expect(payload.embeds[0].toJSON().description).toContain("**Slowmode:** 1m");
        expect(rowsOf(payload)[1].components.map(c => c.label)).toContain("🔓 Unlock");
    });

    test("Purge validates the amount and deletes", async () => {
        const { channel, make } = withChannel();
        const bad = make(`mod:channel:purge:${channel.id}`, { fields: { amount: "500", user: "" } });
        await mod.handleModal(bad);
        expect(channel.bulkDelete).not.toHaveBeenCalled();
        expect(update(bad).content).toBe("❌ The amount must be a number from 1 to 100.");

        const ok = make(`mod:channel:purge:${channel.id}`, { fields: { amount: "20", user: "" } });
        await mod.handleModal(ok);
        expect(channel.bulkDelete).toHaveBeenCalledWith(20, true);
        expect(update(ok).content).toBe(`✅ Deleted **20** message(s) in <#${channel.id}>.`);
        expect(channel.send).not.toHaveBeenCalled();
    });

    test("Lock posts publicly in the target channel", async () => {
        const { channel, make } = withChannel();
        const interaction = make(`mod:channel:lock:${channel.id}`, { fields: { reason: "raid" } });
        await mod.handleModal(interaction);
        expect(channel.permissionOverwrites.edit).toHaveBeenCalled();
        expect(channel.send.mock.calls[0][0].content).toBe("🔒 Channel locked. Reason: raid");
    });

    test("Slowmode reads the duration from the form", async () => {
        const { channel, make } = withChannel();
        await mod.handleModal(make(`mod:channel:slowmode:${channel.id}`, { fields: { duration: "30s" } }));
        expect(channel.setRateLimitPerUser).toHaveBeenCalledWith(30, "Set by mod#0001");
    });
});

describe("history view", () => {
    test("lists the newest entries within limits", async () => {
        const guild = fakeGuild();
        for (let i = 0; i < 30; i++) recordAction(guild.id, { type: "ban", targetId: `u${i % 7}`, moderatorId: "m1", reason: "x".repeat(300) });
        const interaction = fakeInteraction({ guild, customId: "mod:history:show" });
        await mod.handleComponent(interaction);
        const payload = update(interaction);
        expectWithinDiscordLimits(payload, MOD_IDS);
        // One menu entry per user, even when they appear many times
        expect(rowsOf(payload)[0].components[0].options).toHaveLength(7);
    });
});

test("every form the panel opens fits Discord's limits", async () => {
    const channel = fakeTextChannel();
    const guild = fakeGuild({ channels: [channel], members: [] });
    const member = require("./fakes").fakeMember();
    guild.members.cache.set(member.id, member);
    const ids = [
        "mod:home:byid",
        ...["warn", "timeout", "kick", "ban", "softban", "unban", "nickname"].map(a => `mod:user:${a}:${member.id}`),
        ...["purge", "lock", "unlock", "slowmode"].map(a => `mod:channel:${a}:${channel.id}`),
    ];
    for (const customId of ids) {
        const interaction = fakeInteraction({ guild, customId });
        await mod.handleComponent(interaction);
        expect(interaction.showModal).toHaveBeenCalled();
        expectModalWithinLimits(interaction.showModal.mock.calls[0][0]);
    }
});
