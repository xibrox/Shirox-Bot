const { describe, test, expect } = require("bun:test");
const { PermissionFlagsBits: P, Collection } = require("discord.js");
const setup = require("../commands/setup");
const memberJoin = require("../events/memberJoin");
const { getGuildConfig, updateGuildConfig } = require("../lib/guildConfig");
const { getHistory } = require("../lib/modHistory");
const { fakeGuild, fakeMember, fakeInteraction } = require("./fakes");

const update = interaction => interaction.update.mock.calls.at(-1)[0];

function joining(guild, { id = "123456789012345678", bot = false } = {}) {
    const member = fakeMember({ id });
    member.user.bot = bot;
    member.guild = guild;
    return member;
}

describe("joining with the whitelist on", () => {
    test("people not on the list are DMed and kicked", async () => {
        const guild = fakeGuild();
        updateGuildConfig(guild.id, { joinWhitelist: true, joinWhitelistIds: ["111111111111111111"] });
        const member = joining(guild);
        await memberJoin.execute(member);
        expect(member.send).toHaveBeenCalled();
        expect(member.kick).toHaveBeenCalledWith("Join whitelist: not on the list");
        expect(getHistory(guild.id)[0]).toMatchObject({ type: "kick", targetId: member.id, reason: "Not on the join whitelist" });
    });

    test("people on the list, and bots, get in", async () => {
        const guild = fakeGuild();
        updateGuildConfig(guild.id, { joinWhitelist: true, joinWhitelistIds: ["123456789012345678"] });
        const listed = joining(guild);
        await memberJoin.execute(listed);
        expect(listed.kick).not.toHaveBeenCalled();

        const bot = joining(guild, { id: "999999999999999999", bot: true });
        await memberJoin.execute(bot);
        expect(bot.kick).not.toHaveBeenCalled();
    });

    test("nobody is kicked while the whitelist is off", async () => {
        const guild = fakeGuild();
        updateGuildConfig(guild.id, { joinWhitelistIds: ["111111111111111111"] });
        const member = joining(guild);
        await memberJoin.execute(member);
        expect(member.kick).not.toHaveBeenCalled();
    });
});

describe("join whitelist section", () => {
    test("Add users takes IDs separated any way", async () => {
        const interaction = fakeInteraction({
            customId: "setup:joinwhitelist:add",
            fields: { ids: "111111111111111111, 222222222222222222\n<@333333333333333333> nonsense" },
        });
        await setup.handleModal(interaction);
        expect(getGuildConfig(interaction.guild.id).joinWhitelistIds).toEqual(["111111111111111111", "222222222222222222", "333333333333333333"]);
        expect(update(interaction).content).toBe("✅ Added 3 user(s).");
    });

    test("Add current members adds everyone already here except bots", async () => {
        const human = fakeMember({ id: "444444444444444444" });
        const bot = fakeMember({ id: "555555555555555555" });
        bot.user.bot = true;
        const guild = fakeGuild({ members: [human, bot] });
        const interaction = fakeInteraction({ guild, customId: "setup:joinwhitelist:addmembers" });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(guild.id).joinWhitelistIds).toEqual(["444444444444444444"]);
    });

    test("turning it on needs a list and Kick Members", async () => {
        const empty = fakeInteraction({ customId: "setup:joinwhitelist:toggle" });
        await setup.handleComponent(empty);
        expect(getGuildConfig(empty.guild.id).joinWhitelist).toBeUndefined();
        expect(update(empty).content).toBe("❌ Add some users first, or everyone who joins would be kicked.");

        const guild = fakeGuild({ botPermissions: P.BanMembers });
        updateGuildConfig(guild.id, { joinWhitelistIds: ["111111111111111111"] });
        const noKick = fakeInteraction({ guild, customId: "setup:joinwhitelist:toggle" });
        await setup.handleComponent(noKick);
        expect(update(noKick).content).toBe("❌ I need the **Kick Members** permission for this.");

        const ok = fakeInteraction({ customId: "setup:joinwhitelist:toggle" });
        updateGuildConfig(ok.guild.id, { joinWhitelistIds: ["111111111111111111"] });
        await setup.handleComponent(ok);
        expect(getGuildConfig(ok.guild.id).joinWhitelist).toBe(true);
    });

    test("picking someone in the menu removes them", async () => {
        const interaction = fakeInteraction({ customId: "setup:joinwhitelist:remove", values: ["111111111111111111"] });
        updateGuildConfig(interaction.guild.id, { joinWhitelistIds: ["111111111111111111", "222222222222222222"] });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(interaction.guild.id).joinWhitelistIds).toEqual(["222222222222222222"]);
    });

    test("removing the last user turns the whitelist off", async () => {
        const interaction = fakeInteraction({ customId: "setup:joinwhitelist:remove", values: ["111111111111111111"] });
        updateGuildConfig(interaction.guild.id, { joinWhitelist: true, joinWhitelistIds: ["111111111111111111"] });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(interaction.guild.id)).toEqual({});
    });
});
