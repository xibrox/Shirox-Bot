const { test, expect } = require("bun:test");
const { PermissionFlagsBits: P } = require("discord.js");
const { setRestoreRoles } = require("../lib/restoreRoles");
const { getGuildConfig, updateGuildConfig } = require("../lib/guildConfig");
const { fakeGuild } = require("./fakes");

test("enabling saves the setting and caches members", () => {
    const guild = fakeGuild();
    expect(setRestoreRoles(guild, true)).toBeNull();
    expect(getGuildConfig(guild.id).restoreRoles).toBe(true);
    expect(guild.members.fetch).toHaveBeenCalled();
});

test("enabling needs Manage Roles", () => {
    const guild = fakeGuild({ botPermissions: P.KickMembers });
    expect(setRestoreRoles(guild, true)).toBe("❌ I need the **Manage Roles** permission for this.");
    expect(getGuildConfig(guild.id).restoreRoles).toBeUndefined();
});

test("disabling works without permissions", () => {
    const guild = fakeGuild({ botPermissions: 0n });
    updateGuildConfig(guild.id, { restoreRoles: true });
    expect(setRestoreRoles(guild, false)).toBeNull();
    expect(getGuildConfig(guild.id).restoreRoles).toBeUndefined();
});
