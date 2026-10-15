const { test, expect } = require("bun:test");
const { PermissionFlagsBits: P } = require("discord.js");
const { honeypotError, honeypotWarningEmbed } = require("../lib/honeypot");
const { fakeGuild, fakeChannel } = require("./fakes");

test("soft ban and ban need Ban Members", () => {
    const guild = fakeGuild({ botPermissions: P.KickMembers });
    expect(honeypotError(guild, fakeChannel(), "softban")).toBe("❌ I need the **Ban Members** permission for this.");
    expect(honeypotError(guild, fakeChannel(), "ban")).toBe("❌ I need the **Ban Members** permission for this.");
    expect(honeypotError(guild, fakeChannel(), "kick")).toBeNull();
});

test("kick needs Kick Members", () => {
    const guild = fakeGuild({ botPermissions: P.BanMembers });
    expect(honeypotError(guild, fakeChannel(), "kick")).toBe("❌ I need the **Kick Members** permission for this.");
});

test("the bot must be able to see and clean the channel", () => {
    const channel = fakeChannel("7", P.ViewChannel);
    expect(honeypotError(fakeGuild(), channel, "softban")).toBe("❌ I need View Channel and Manage Messages in <#7>.");
});

test("the warning says what happens to people who post", () => {
    expect(honeypotWarningEmbed("kick").toJSON().description).toContain("automatically kicked");
    expect(honeypotWarningEmbed("ban").toJSON().description).toContain("automatically banned");
    expect(honeypotWarningEmbed("softban").toJSON().description).toContain("removed from the server");
});

test("the warning uses custom text with {action}", () => {
    const json = honeypotWarningEmbed("kick", { title: "Stop!", text: "You will be {action}." }).toJSON();
    expect(json.title).toBe("Stop!");
    expect(json.description).toBe("You will be kicked.");
});
