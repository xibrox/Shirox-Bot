const { describe, test, expect } = require("bun:test");
const { PermissionFlagsBits: P } = require("discord.js");
const { permissionNames, listText } = require("../lib/permissions");
const { missingChannelPermissions, SEND_EMBED_PERMISSIONS } = require("../lib/channelChecks");
const { fakeChannel } = require("./fakes");

describe("permissionNames", () => {
    test("uses the names Discord shows in its settings", () => {
        expect(permissionNames(P.ManageGuild)).toEqual(["Manage Server"]);
        expect(permissionNames(P.ModerateMembers)).toEqual(["Timeout Members"]);
    });

    test("splits other flag names into words", () => {
        expect(permissionNames([P.ViewChannel, P.SendMessages])).toEqual(["View Channel", "Send Messages"]);
    });
});

describe("listText", () => {
    test("joins with commas and a final and", () => {
        expect(listText(["a"])).toBe("a");
        expect(listText(["a", "b"])).toBe("a and b");
        expect(listText(["a", "b", "c"])).toBe("a, b and c");
    });
});

describe("missingChannelPermissions", () => {
    test("returns null when the bot has every permission", () => {
        const channel = fakeChannel("1", P.ViewChannel | P.SendMessages | P.EmbedLinks);
        expect(missingChannelPermissions(channel, {}, SEND_EMBED_PERMISSIONS)).toBeNull();
    });

    test("lists every needed permission when any is missing, like the commands always did", () => {
        const channel = fakeChannel("1", P.ViewChannel);
        expect(missingChannelPermissions(channel, {}, SEND_EMBED_PERMISSIONS))
            .toBe("❌ I need View Channel, Send Messages and Embed Links in <#1>.");
    });
});
