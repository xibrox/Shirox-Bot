const { describe, test, expect } = require("bun:test");
const { PermissionFlagsBits: P } = require("discord.js");
const setup = require("../commands/setup");
const { getGuildConfig, updateGuildConfig } = require("../lib/guildConfig");
const { fakeGuild, fakeRole, fakeInteraction } = require("./fakes");

const update = interaction => interaction.update.mock.calls[0][0];

describe("auto role section", () => {
    test("picking a member role saves it", async () => {
        const role = fakeRole();
        const guild = fakeGuild({ roles: [role] });
        const interaction = fakeInteraction({ guild, customId: "setup:autorole:members", values: [role.id] });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(guild.id).autoRoleId).toBe(role.id);
        expect(update(interaction).content).toBe(`✅ <@&${role.id}> will now be given to new members.`);
    });

    test("the bot role is saved separately", async () => {
        const role = fakeRole();
        const guild = fakeGuild({ roles: [role] });
        await setup.handleComponent(fakeInteraction({ guild, customId: "setup:autorole:bots", values: [role.id] }));
        expect(getGuildConfig(guild.id).botAutoRoleId).toBe(role.id);
        expect(getGuildConfig(guild.id).autoRoleId).toBeUndefined();
    });

    test("a role above the bot is refused", async () => {
        const role = fakeRole(undefined, { position: 200 });
        const guild = fakeGuild({ roles: [role] });
        const interaction = fakeInteraction({ guild, customId: "setup:autorole:members", values: [role.id] });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(guild.id).autoRoleId).toBeUndefined();
        expect(update(interaction).content).toContain("equal to or above my highest role");
    });

    test("clearing the bot role leaves the member role", async () => {
        const interaction = fakeInteraction({ customId: "setup:autorole:clear:bots" });
        updateGuildConfig(interaction.guild.id, { autoRoleId: "r1", botAutoRoleId: "r2" });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(interaction.guild.id)).toMatchObject({ autoRoleId: "r1" });
        expect(getGuildConfig(interaction.guild.id).botAutoRoleId).toBeUndefined();
    });

    test("is hidden from members without Manage Roles", () => {
        const payload = setup.homeView(fakeInteraction({ permissions: P.ManageGuild }));
        expect(payload.components[0].toJSON().components[0].options.map(o => o.value)).not.toContain("autorole");
    });
});

describe("role restore section", () => {
    test("the toggle enables it and mentions the auto role", async () => {
        const interaction = fakeInteraction({ customId: "setup:restoreroles:toggle" });
        updateGuildConfig(interaction.guild.id, { autoRoleId: "r1" });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(interaction.guild.id).restoreRoles).toBe(true);
        expect(interaction.guild.members.fetch).toHaveBeenCalled();
        expect(update(interaction).content).toContain("Your auto role will still be given");
    });

    test("enabling without Manage Roles shows the error", async () => {
        const guild = fakeGuild({ botPermissions: P.KickMembers });
        const interaction = fakeInteraction({ guild, customId: "setup:restoreroles:toggle" });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(guild.id).restoreRoles).toBeUndefined();
        expect(update(interaction).content).toBe("❌ I need the **Manage Roles** permission for this.");
    });

    test("the toggle turns it off again", async () => {
        const interaction = fakeInteraction({ customId: "setup:restoreroles:toggle" });
        updateGuildConfig(interaction.guild.id, { restoreRoles: true });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(interaction.guild.id).restoreRoles).toBeUndefined();
        expect(update(interaction).content).toBe("✅ Role restore disabled.");
    });
});
