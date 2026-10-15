const { mock } = require("bun:test");
const { Collection, PermissionsBitField, PermissionFlagsBits, ChannelType } = require("discord.js");

let nextId = 0;
const uniqueId = prefix => `${prefix}${++nextId}`;

function fakeChannel(id = uniqueId("channel"), botPermissions = PermissionFlagsBits.Administrator) {
    return {
        id,
        type: ChannelType.GuildText,
        permissionsFor: () => new PermissionsBitField(botPermissions),
        send: mock(async () => {}),
        toString: () => `<#${id}>`,
        isTextBased: () => true,
    };
}

// A text channel with the moderation methods channel tools use
function fakeTextChannel(id = uniqueId("channel"), { locked = false, slowmode = 0, messages = [] } = {}) {
    const channel = fakeChannel(id);
    const overwrites = new Collection();
    if (locked) overwrites.set("everyone", { deny: new PermissionsBitField(PermissionFlagsBits.SendMessages) });
    Object.assign(channel, {
        name: `chan-${id}`,
        rateLimitPerUser: slowmode,
        permissionOverwrites: { cache: overwrites, edit: mock(async () => {}) },
        setRateLimitPerUser: mock(async seconds => { channel.rateLimitPerUser = seconds; }),
        bulkDelete: mock(async target => {
            const count = typeof target === "number" ? target : target.length;
            return new Collection(Array.from({ length: count }, (_, i) => [String(i), {}]));
        }),
        messages: { fetch: mock(async () => new Collection(messages.map(m => [m.id, m]))) },
    });
    return channel;
}

function fakeRole(id = uniqueId("role"), { position = 1, managed = false } = {}) {
    return { id, position, managed, name: `Role ${id}`, toString: () => `<@&${id}>` };
}

function fakeUser(id = uniqueId("user"), { bot = false } = {}) {
    return {
        id,
        bot,
        tag: `user#${id}`,
        username: `user${id}`,
        createdTimestamp: Date.now() - 30 * 86_400_000,
        displayAvatarURL: () => "https://cdn.example/a.png",
        send: mock(async () => {}),
        toString: () => `<@${id}>`,
    };
}

// A guild member; `position` is their highest role (the fake moderator is 50, the bot 100)
function fakeMember({
    id = uniqueId("user"), position = 10, kickable = true, bannable = true, moderatable = true, manageable = true,
    roles = [], timedOutUntil = null, nickname = null,
} = {}) {
    return {
        id,
        user: fakeUser(id),
        nickname,
        kickable,
        bannable,
        moderatable,
        manageable,
        joinedTimestamp: Date.now() - 86_400_000,
        communicationDisabledUntilTimestamp: timedOutUntil,
        roles: {
            highest: { position, toString: () => "<@&top>" },
            cache: new Collection(roles.map(r => [r.id, r])),
            add: mock(async () => {}),
            remove: mock(async () => {}),
        },
        send: mock(async () => {}),
        kick: mock(async () => {}),
        timeout: mock(async () => {}),
        setNickname: mock(async () => {}),
        toString: () => `<@${id}>`,
    };
}

// Every guild gets its own id, so settings saved by one test never leak into another
function fakeGuild({ botPermissions = PermissionFlagsBits.Administrator, channels = [], roles = [], members = [], bans = [] } = {}) {
    const memberCache = new Collection(members.map(m => [m.id, m]));
    const banned = new Set(bans);
    return {
        id: uniqueId("guild"),
        name: "Test Server",
        ownerId: "owner",
        iconURL: () => null,
        members: {
            me: { permissions: new PermissionsBitField(botPermissions), roles: { highest: { position: 100 } } },
            cache: memberCache,
            // No id: "fetch everyone" (used by role restore); with an id: one member or an error
            fetch: mock(async memberId => {
                if (!memberId) return memberCache;
                if (memberCache.has(memberId)) return memberCache.get(memberId);
                throw new Error("Unknown Member");
            }),
            ban: mock(async user => { banned.add(user.id ?? user); }),
            unban: mock(async userId => {
                if (!banned.delete(userId)) throw new Error("Unknown Ban");
                return { id: userId, tag: `user#${userId}` };
            }),
        },
        bans: {
            fetch: mock(async userId => {
                const entry = u => ({ user: { id: u, tag: `user#${u}` }, reason: "spam" });
                if (userId) {
                    if (!banned.has(userId)) throw new Error("Unknown Ban");
                    return entry(userId);
                }
                return new Collection([...banned].map(u => [u, entry(u)]));
            }),
        },
        channels: {
            cache: new Collection(channels.map(c => [c.id, c])),
            fetch: mock(async channelId => {
                const channel = channels.find(c => c.id === channelId);
                if (!channel) throw Object.assign(new Error("Unknown Channel"), { code: 10003 });
                return channel;
            }),
        },
        roles: { cache: new Collection(roles.map(r => [r.id, r])), everyone: { id: "everyone" } },
    };
}

function fakeInteraction({ guild = fakeGuild(), permissions = PermissionFlagsBits.Administrator, customId = "", values = [], fields = {} } = {}) {
    const interaction = {
        guild,
        customId,
        values,
        user: { id: "moderator", tag: "mod#0001" },
        member: { roles: { highest: { position: 50 } } },
        memberPermissions: new PermissionsBitField(permissions),
        channel: fakeChannel("here"),
        channelId: "here",
        client: { user: { id: "bot" } },
        fields: { getTextInputValue: name => fields[name] ?? "" },
        replied: false,
        deferred: false,
    };
    for (const method of ["reply", "update", "showModal"]) {
        interaction[method] = mock(async () => { interaction.replied = true; });
    }
    return interaction;
}

module.exports = { fakeChannel, fakeTextChannel, fakeRole, fakeUser, fakeMember, fakeGuild, fakeInteraction };
