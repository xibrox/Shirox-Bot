const { PermissionFlagsBits, ChannelType } = require("discord.js");

// Makes (or reuses) a permanent invite, trying the preferred channels first, then the rules/system
// channel, then any text channel. Returns null if the bot can't create invites anywhere.
async function createPermanentInvite(guild, { preferred = [], reason } = {}) {
    const me = guild.members.me;
    const textChannels = guild.channels.cache
        .filter(c => c.type === ChannelType.GuildText)
        .sort((a, b) => a.rawPosition - b.rawPosition)
        .values();
    const candidates = [...preferred, guild.rulesChannel, guild.systemChannel, ...textChannels].filter(Boolean);
    const channel = candidates.find(c => c.permissionsFor(me)?.has(PermissionFlagsBits.CreateInstantInvite));
    if (!channel) return null;
    // unique: false reuses an existing identical permanent invite instead of making a new one each time
    return channel.createInvite({ maxAge: 0, maxUses: 0, unique: false, reason });
}

module.exports = { createPermanentInvite };
