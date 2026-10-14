const { PermissionFlagsBits } = require("discord.js");
const { loadJsonFile } = require("./jsonFile");

// { [guildId]: { [userId]: { roles: [roleId], nickname, savedAt } } }
const store = loadJsonFile("saved-roles");

// Returns the saved entry, or null if there was nothing worth saving
function saveMemberRoles(member) {
    const roles = member.roles.cache
        .filter(r => r.id !== member.guild.id && !r.managed)
        .map(r => r.id);
    if (!roles.length && !member.nickname) return null;
    const entry = { roles, nickname: member.nickname, savedAt: Date.now() };
    store.data[member.guild.id] ??= {};
    store.data[member.guild.id][member.id] = entry;
    store.save();
    return entry;
}

function forgetMemberRoles(guildId, userId) {
    if (!store.data[guildId]?.[userId]) return;
    delete store.data[guildId][userId];
    store.save();
}

// Gives back saved roles (skipping ones that are gone, above the bot, or grant Administrator).
// Returns { restored: Role[], nickname } or null if nothing was saved.
async function restoreMemberRoles(member) {
    const saved = store.data[member.guild.id]?.[member.id];
    if (!saved) return null;
    forgetMemberRoles(member.guild.id, member.id);

    const botTop = member.guild.members.me.roles.highest.position;
    const roles = saved.roles
        .map(id => member.guild.roles.cache.get(id))
        .filter(r => r && !r.managed && r.position < botTop && !r.permissions.has(PermissionFlagsBits.Administrator));
    if (roles.length) await member.roles.add(roles, "Restoring roles from before they left");

    let nickname = null;
    if (saved.nickname && member.manageable) {
        nickname = await member.setNickname(saved.nickname, "Restoring nickname from before they left")
            .then(() => saved.nickname, () => null);
    }
    return { restored: roles, nickname };
}

module.exports = { saveMemberRoles, forgetMemberRoles, restoreMemberRoles };
