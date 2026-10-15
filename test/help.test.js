const { describe: group, test, expect } = require("bun:test");
const { Collection, PermissionsBitField, PermissionFlagsBits } = require("discord.js");

const help = require("../commands/help");
const setup = require("../commands/setup");
const mod = require("../commands/mod");
const welcome = require("../commands/welcome");
const ban = require("../commands/ban");
const ping = require("../commands/ping");

function fakeInteraction(permissions) {
    const commands = new Collection([setup, mod, welcome, ban, ping].map(c => [c.data.name, c]));
    return { client: { commands }, memberPermissions: new PermissionsBitField(permissions) };
}

group("help with group commands", () => {
    test("lists /setup but not the grouped /welcome on its own", () => {
        const names = help.visibleCommands(fakeInteraction(PermissionFlagsBits.Administrator), "setup").map(c => c.data.name);
        expect(names).toContain("setup");
        expect(names).not.toContain("welcome");
    });

    test("keeps ungrouped commands", () => {
        const names = help.visibleCommands(fakeInteraction(0n), "utility").map(c => c.data.name);
        expect(names).toContain("ping");
    });

    test("describes group entries with full usage and the shortcut", () => {
        const text = help.describe(setup, fakeInteraction(PermissionFlagsBits.Administrator)).join("\n\n");
        expect(text).toContain("`/setup automod invites <enabled>`");
        expect(text).toContain("Shortcut: `/automod`");
        expect(text).toContain("`/setup faq add`");
        expect(text).toContain("Shortcut: `/faqmanage`");
    });

    test("describes plain entries with their options", () => {
        const text = help.describe(mod, fakeInteraction(PermissionFlagsBits.Administrator)).join("\n\n");
        expect(text).toContain("`/mod ban <user> [reason] [delete_messages]`");
        expect(text).toContain("Shortcut: `/ban`");
    });

    test("hides entries the member lacks permission for", () => {
        const text = help.describe(setup, fakeInteraction(PermissionFlagsBits.ManageGuild)).join("\n\n");
        expect(text).toContain("/setup welcome");
        expect(text).not.toContain("/setup honeypot");
    });
});
