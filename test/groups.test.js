const { describe, test, expect } = require("bun:test");
const { PermissionFlagsBits } = require("discord.js");

const setup = require("../commands/setup");
const mod = require("../commands/mod");

const SETUP_ENTRIES = {
    welcome: "welcome", goodbye: "goodbye", honeypot: "honeypot", automod: "automod", logs: "logs",
    autorole: "autorole", faq: "faqmanage", restoreroles: "restoreroles", selfroles: "selfroles",
};
const MOD_ENTRIES = {
    ban: "ban", unban: "unban", kick: "kick", softban: "softban", timeout: "timeout", warn: "warn",
    warnings: "warnings", purge: "purge", lock: "lock", slowmode: "slowmode", role: "role", say: "say", embed: "embed",
};

// Each entry must mirror its source module: same subcommands for groups, same options for plain commands
function expectMirrors(groupJson, entries) {
    expect(groupJson.options.map(o => o.name)).toEqual(Object.keys(entries));
    for (const [entryName, file] of Object.entries(entries)) {
        const sourceJson = require(`../commands/${file}`).data.toJSON();
        const entryJson = groupJson.options.find(o => o.name === entryName);
        const sourceIsGroup = (sourceJson.options || []).some(o => o.type === 1);
        expect(entryJson.type).toBe(sourceIsGroup ? 2 : 1);
        expect(entryJson.description).toBe(sourceJson.description);
        expect((entryJson.options || []).map(o => o.name)).toEqual((sourceJson.options || []).map(o => o.name));
    }
}

describe("/setup", () => {
    test("serializes with the expected entries", () => {
        const json = setup.data.toJSON();
        expect(json.name).toBe("setup");
        expect(json.default_member_permissions).toBe(String(PermissionFlagsBits.ManageGuild));
        expect(json.dm_permission).toBe(false);
        expectMirrors(json, SETUP_ENTRIES);
    });

    test("is in the setup category", () => {
        expect(setup.category).toBe("setup");
    });
});

describe("/mod", () => {
    test("serializes with the expected entries", () => {
        const json = mod.data.toJSON();
        expect(json.name).toBe("mod");
        expect(json.default_member_permissions).toBe(String(PermissionFlagsBits.ModerateMembers));
        expect(json.dm_permission).toBe(false);
        expectMirrors(json, MOD_ENTRIES);
    });

    test("is in the moderation category", () => {
        expect(mod.category).toBe("moderation");
    });
});
