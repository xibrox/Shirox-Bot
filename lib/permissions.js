const { PermissionsBitField } = require("discord.js");

// Names as Discord's settings show them, where they differ from the API flag names
const UI_NAMES = { ManageGuild: "Manage Server", ModerateMembers: "Timeout Members" };

// Permission bits -> readable names, e.g. ["Manage Server"]
function permissionNames(bits) {
    return new PermissionsBitField(bits).toArray().map(flag => UI_NAMES[flag] ?? flag.replace(/(?<=[a-z])(?=[A-Z])/g, " "));
}

// ["a", "b", "c"] -> "a, b and c"
function listText(items) {
    return items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : (items[0] ?? "");
}

module.exports = { permissionNames, listText };
