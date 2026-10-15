const { test, expect } = require("bun:test");
const { PermissionFlagsBits: P } = require("discord.js");
const mod = require("../commands/mod");
const { getWarnings } = require("../lib/warnings");
const { fakeGuild, fakeMember, fakeUser, fakeInteraction } = require("./fakes");

const update = interaction => interaction.update.mock.calls.at(-1)[0];

function setup({ member = fakeMember(), guild, permissions } = {}) {
    guild ??= fakeGuild({ members: [member] });
    const make = (customId, fields) => {
        const interaction = fakeInteraction({ guild, customId, fields, permissions });
        interaction.client.users = { fetch: async id => (id === member.id ? member.user : Promise.reject(new Error("Unknown User"))) };
        return interaction;
    };
    return { member, guild, make };
}

test("Warn opens a form, and submitting warns and posts publicly", async () => {
    const { member, guild, make } = setup();
    const open = make(`mod:user:warn:${member.id}`);
    await mod.handleComponent(open);
    expect(open.showModal.mock.calls[0][0].toJSON().custom_id).toBe(`mod:user:warn:${member.id}`);

    const submit = make(`mod:user:warn:${member.id}`, { reason: "spam" });
    await mod.handleModal(submit);
    expect(getWarnings(guild.id, member.id)).toHaveLength(1);
    expect(submit.channel.send.mock.calls[0][0]).toEqual({
        content: `⚠️ Warned **${member.user.tag}** (warning #1, 1 total). Reason: spam`, allowedMentions: { parse: [] },
    });
    expect(update(submit).content).toBe(`⚠️ Warned **${member.user.tag}** (warning #1, 1 total). Reason: spam`);
});

test("Timeout uses the duration from the form", async () => {
    const { member, make } = setup();
    await mod.handleModal(make(`mod:user:timeout:${member.id}`, { duration: "1h", reason: "" }));
    expect(member.timeout).toHaveBeenCalledWith(3_600_000, "mod#0001: No reason provided");
});

test("a bad duration changes nothing", async () => {
    const { member, make } = setup();
    const submit = make(`mod:user:timeout:${member.id}`, { duration: "5x", reason: "" });
    await mod.handleModal(submit);
    expect(member.timeout).not.toHaveBeenCalled();
    expect(update(submit).content).toBe("⏰ Invalid duration. Examples: `10m`, `1h`, `2d`.");
    expect(submit.channel.send).not.toHaveBeenCalled();
});

test("Remove timeout acts right away", async () => {
    const { member, make } = setup({ member: fakeMember({ timedOutUntil: Date.now() + 60_000 }) });
    await mod.handleComponent(make(`mod:user:untimeout:${member.id}`));
    expect(member.timeout).toHaveBeenCalledWith(null, "mod#0001: Removed with /mod");
});

test("Ban takes the delete-messages window and refuses unknown windows", async () => {
    const { member, guild, make } = setup();
    const bad = make(`mod:user:ban:${member.id}`, { reason: "raid", delete: "3d" });
    await mod.handleModal(bad);
    expect(guild.members.ban).not.toHaveBeenCalled();
    expect(update(bad).content).toBe("❌ Delete messages must be 0, 1h, 24h or 7d.");

    await mod.handleModal(make(`mod:user:ban:${member.id}`, { reason: "raid", delete: "24h" }));
    expect(guild.members.ban).toHaveBeenCalledWith(member.user, { reason: "mod#0001: raid", deleteMessageSeconds: 86_400 });
});

test("member-only actions on someone who left say so", async () => {
    const user = fakeUser("123456789012345678");
    const guild = fakeGuild();
    const interaction = fakeInteraction({ guild, customId: `mod:user:kick:${user.id}`, fields: { reason: "" } });
    interaction.client.users = { fetch: async () => user };
    await mod.handleModal(interaction);
    expect(update(interaction).content).toBe("❌ That user is not in this server.");
});

test("Nickname form is prefilled and an empty value resets it", async () => {
    const { member, make } = setup({ member: fakeMember({ nickname: "Old" }) });
    const open = make(`mod:user:nickname:${member.id}`);
    await mod.handleComponent(open);
    expect(open.showModal.mock.calls[0][0].toJSON().components[0].components[0].value).toBe("Old");

    await mod.handleModal(make(`mod:user:nickname:${member.id}`, { nickname: "  " }));
    expect(member.setNickname).toHaveBeenCalledWith(null, "By mod#0001");
});

test("Kick needs Kick Members even from a stale panel", async () => {
    const { member, make } = setup({ permissions: P.ModerateMembers });
    const interaction = make(`mod:user:kick:${member.id}`);
    await mod.handleComponent(interaction);
    expect(interaction.reply.mock.calls[0][0].content).toBe("❌ You need **Kick Members** for this.");
});
