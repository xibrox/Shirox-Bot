// Returns an error message if the invoking moderator can't act on `target`, otherwise null.
function checkHierarchy(interaction, target) {
    if (target.id === interaction.user.id) return "❌ You can't do that to yourself.";
    if (target.id === interaction.client.user.id) return "❌ I can't do that to myself.";
    if (target.id === interaction.guild.ownerId) return "❌ You can't do that to the server owner.";

    const isOwner = interaction.user.id === interaction.guild.ownerId;
    if (!isOwner && target.roles.highest.position >= interaction.member.roles.highest.position) {
        return "❌ That member's highest role is equal to or above yours.";
    }

    const me = interaction.guild.members.me;
    if (target.roles.highest.position >= me.roles.highest.position) {
        return "❌ That member's highest role is equal to or above mine. Move my role higher in Server Settings → Roles.";
    }
    return null;
}

// Returns an error message if the bot can't assign `role`, otherwise null.
function checkAssignableRole(interaction, role) {
    if (role.managed) return "❌ That role is managed by an integration and can't be assigned manually.";
    if (role.id === interaction.guild.id) return "❌ You can't use @everyone here.";

    const me = interaction.guild.members.me;
    if (role.position >= me.roles.highest.position) {
        return `❌ ${role} is equal to or above my highest role. Move my role higher in Server Settings → Roles.`;
    }

    const isOwner = interaction.user.id === interaction.guild.ownerId;
    if (!isOwner && role.position >= interaction.member.roles.highest.position) {
        return `❌ ${role} is equal to or above your highest role.`;
    }
    return null;
}

// Bans then immediately unbans: removes the user and deletes their recent messages, but lets them rejoin
async function softban(guild, userId, reason, deleteMessageSeconds = 86_400) {
    await guild.members.ban(userId, { reason, deleteMessageSeconds });
    await guild.members.unban(userId, `Soft ban: ${reason}`);
}

module.exports = { checkHierarchy, checkAssignableRole, softban };
