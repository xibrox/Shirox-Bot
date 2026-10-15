const { describe, test, expect, mock } = require("bun:test");
const { PermissionsBitField } = require("discord.js");
const { isActive, featureState } = require("../lib/features");
const { updateGuildConfig } = require("../lib/guildConfig");
const { sendLog, createLogEmbed } = require("../lib/logger");
const memberJoin = require("../events/memberJoin");
const honeypotEvent = require("../events/honeypot");
const { fakeGuild, fakeChannel } = require("./fakes");

const KEYS = [
    ["welcome", "welcomeChannelId", "welcomeOff"],
    ["goodbye", "goodbyeChannelId", "goodbyeOff"],
    ["logs", "logChannelId", "logsOff"],
    ["honeypot", "honeypotChannelId", "honeypotOff"],
];

describe("isActive and featureState", () => {
    for (const [feature, channelKey, offKey] of KEYS) {
        test(`${feature}: off, on, paused`, () => {
            expect([isActive({}, feature), featureState({}, feature)]).toEqual([false, "off"]);
            expect([isActive({ [channelKey]: "c" }, feature), featureState({ [channelKey]: "c" }, feature)]).toEqual([true, "on"]);
            const paused = { [channelKey]: "c", [offKey]: true };
            expect([isActive(paused, feature), featureState(paused, feature)]).toEqual([false, "paused"]);
        });
    }
});

function fakeMember(guild) {
    return {
        id: "u1",
        guild,
        user: { username: "newbie", bot: false, createdTimestamp: Date.now(), displayAvatarURL: () => "https://cdn.example/a.png" },
        toString: () => "<@u1>",
    };
}

describe("paused features stay quiet", () => {
    test("welcome is only sent while active", async () => {
        const channel = fakeChannel();
        const guild = fakeGuild({ channels: [channel] });
        await memberJoin.sendWelcome(fakeMember(guild), { welcomeChannelId: channel.id, welcomeOff: true });
        expect(channel.send).not.toHaveBeenCalled();
        await memberJoin.sendWelcome(fakeMember(guild), { welcomeChannelId: channel.id });
        expect(channel.send).toHaveBeenCalledTimes(1);
    });

    test("the honeypot ignores messages while paused", async () => {
        const guild = fakeGuild();
        updateGuildConfig(guild.id, { honeypotChannelId: "trap", honeypotOff: true });
        const message = {
            inGuild: () => true,
            author: { bot: false },
            guild: { id: guild.id, ownerId: "owner" },
            channelId: "trap",
            member: { id: "u1", permissions: new PermissionsBitField(0n) },
            delete: mock(async () => {}),
        };
        await honeypotEvent.execute(message);
        expect(message.delete).not.toHaveBeenCalled();
    });
});

describe("sendLog", () => {
    function logGuild(config) {
        const channel = fakeChannel();
        const guild = fakeGuild({ channels: [channel] });
        updateGuildConfig(guild.id, { logChannelId: channel.id, ...config });
        return { guild, channel };
    }

    test("sends when logs are on and the type is on", async () => {
        const { guild, channel } = logGuild({});
        await sendLog(guild, "members", createLogEmbed("success", "📥 Member joined"));
        expect(channel.send.mock.calls[0][0].embeds[0].toJSON().title).toBe("📥 Member joined");
    });

    test("skips everything while paused", async () => {
        const { guild, channel } = logGuild({ logsOff: true });
        await sendLog(guild, "members", createLogEmbed("success", "x"));
        expect(channel.send).not.toHaveBeenCalled();
    });

    test("skips types that are switched off", async () => {
        const { guild, channel } = logGuild({ logTypesOff: ["voice"] });
        await sendLog(guild, "voice", createLogEmbed("default", "x"));
        expect(channel.send).not.toHaveBeenCalled();
        await sendLog(guild, "server", createLogEmbed("default", "x"));
        expect(channel.send).toHaveBeenCalledTimes(1);
    });
});
