const { describe, test, expect } = require("bun:test");
const mod = require("../commands/mod");
const { addWarning, getWarnings } = require("../lib/warnings");
const { fakeGuild, fakeMember, fakeRole, fakeInteraction } = require("./fakes");
const { rowsOf, expectWithinDiscordLimits } = require("./limits");

const update = interaction => interaction.update.mock.calls.at(-1)[0];
const customIds = payload => rowsOf(payload).flatMap(row => row.components.map(c => c.custom_id));

function make(guild, member, customId, extra = {}) {
    const interaction = fakeInteraction({ guild, customId, ...extra });
    interaction.client.users = { fetch: async () => member.user };
    return interaction;
}

describe("roles view", () => {
    test("Give roles adds them and posts publicly", async () => {
        const role = fakeRole();
        const member = fakeMember();
        const guild = fakeGuild({ members: [member], roles: [role] });
        await mod.handleComponent(make(guild, member, `mod:roles:show:${member.id}`));
        const give = make(guild, member, `mod:roles:give:${member.id}`, { values: [role.id] });
        await mod.handleComponent(give);
        expect(member.roles.add).toHaveBeenCalledWith([role], "By mod#0001");
        expect(give.channel.send.mock.calls[0][0].content).toBe(`✅ Gave <@&${role.id}> to <@${member.id}>.`);
        expectWithinDiscordLimits(update(give), /^mod:/);
    });

    test("Remove roles takes them away", async () => {
        const role = fakeRole();
        const member = fakeMember({ roles: [role] });
        const guild = fakeGuild({ members: [member], roles: [role] });
        await mod.handleComponent(make(guild, member, `mod:roles:take:${member.id}`, { values: [role.id] }));
        expect(member.roles.remove).toHaveBeenCalledWith([role], "By mod#0001");
    });
});

describe("warnings view", () => {
    function warned(count) {
        const member = fakeMember();
        const guild = fakeGuild({ members: [member] });
        for (let i = 0; i < count; i++) addWarning(guild.id, member.id, `reason ${i} ${"z".repeat(380)}`, "m1");
        return { member, guild };
    }

    test("lists warnings within limits and removes one", async () => {
        const { member, guild } = warned(30);
        const show = make(guild, member, `mod:warnings:show:${member.id}`);
        await mod.handleComponent(show);
        expectWithinDiscordLimits(update(show), /^mod:/);

        const remove = make(guild, member, `mod:warnings:remove:${member.id}`, { values: ["3"] });
        await mod.handleComponent(remove);
        expect(getWarnings(guild.id, member.id).map(w => w.id)).not.toContain(3);
        expect(update(remove).content).toBe("✅ Removed warning #3.");
    });

    test("Clear all asks first", async () => {
        const { member, guild } = warned(2);
        const ask = make(guild, member, `mod:warnings:clear:${member.id}`);
        await mod.handleComponent(ask);
        expect(customIds(update(ask))).toContain(`mod:warnings:confirmclear:${member.id}`);
        expect(getWarnings(guild.id, member.id)).toHaveLength(2);

        const confirm = make(guild, member, `mod:warnings:confirmclear:${member.id}`);
        await mod.handleComponent(confirm);
        expect(getWarnings(guild.id, member.id)).toEqual([]);
        expect(update(confirm).content).toBe("✅ Cleared **2** warning(s).");
    });
});
