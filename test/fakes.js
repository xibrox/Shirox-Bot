const { mock } = require("bun:test");
const { Collection, PermissionsBitField, PermissionFlagsBits } = require("discord.js");

let nextId = 0;
const uniqueId = prefix => `${prefix}${++nextId}`;

function fakeChannel(id = uniqueId("channel"), botPermissions = PermissionFlagsBits.Administrator) {
    return {
        id,
        permissionsFor: () => new PermissionsBitField(botPermissions),
        send: mock(async () => {}),
        toString: () => `<#${id}>`,
        isTextBased: () => true,
    };
}

function fakeRole(id = uniqueId("role"), { position = 1, managed = false } = {}) {
    return { id, position, managed, name: `Role ${id}`, toString: () => `<@&${id}>` };
}

// Every guild gets its own id, so settings saved by one test never leak into another
function fakeGuild({ botPermissions = PermissionFlagsBits.Administrator, channels = [], roles = [] } = {}) {
    return {
        id: uniqueId("guild"),
        name: "Test Server",
        ownerId: "owner",
        iconURL: () => null,
        members: {
            me: { permissions: new PermissionsBitField(botPermissions), roles: { highest: { position: 100 } } },
            fetch: mock(async () => {}),
        },
        channels: { cache: new Collection(channels.map(c => [c.id, c])) },
        roles: { cache: new Collection(roles.map(r => [r.id, r])) },
    };
}

function fakeInteraction({ guild = fakeGuild(), permissions = PermissionFlagsBits.Administrator, customId = "", values = [], fields = {} } = {}) {
    const interaction = {
        guild,
        customId,
        values,
        user: { id: "moderator" },
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

module.exports = { fakeChannel, fakeRole, fakeGuild, fakeInteraction };
