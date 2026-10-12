const { ApplicationIntegrationType, InteractionContextType } = require("discord.js");

// OWNER_ID in .env, comma-separated if there's more than one
const OWNER_IDS = (process.env.OWNER_ID || "").split(",").map(id => id.trim()).filter(Boolean);

function isOwner(userId) {
    return OWNER_IDS.includes(userId);
}

// Owner commands are installed to the owner's account, not to servers, so they work in
// any server the owner is in and never show up in other members' command lists
function asOwnerCommand(builder) {
    return builder
        .setIntegrationTypes(ApplicationIntegrationType.UserInstall)
        .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel);
}

async function dmOwners(client, message) {
    for (const id of OWNER_IDS) {
        await client.users.send(id, message).catch(err => console.error(`Couldn't DM owner ${id}:`, err.message));
    }
}

module.exports = { OWNER_IDS, isOwner, asOwnerCommand, dmOwners };
