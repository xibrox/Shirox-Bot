const { PermissionFlagsBits, RESTJSONErrorCodes } = require("discord.js");
const { loadJsonFile } = require("./jsonFile");
const { createPermanentInvite } = require("./invites");

// The Shirox server invite. Starts as SUPPORT_INVITE_CODE from .env; if that invite gets deleted,
// a replacement is found or created in the Shirox server and saved here.
const store = loadJsonFile("support-invite");
const RECHECK_MS = 10 * 60 * 1000;
let lastValidAt = 0;

function toCode(input) {
    return input?.trim().replace(/^(https?:\/\/)?(www\.)?(discord\.gg|discord(app)?\.com\/invite)\//i, "").replace(/\/$/, "") || null;
}

function save(changes) {
    Object.assign(store.data, changes);
    store.save();
}

function currentCode() {
    return store.data.code || toCode(process.env.SUPPORT_INVITE_CODE);
}

function supportGuildId() {
    return process.env.SUPPORT_GUILD_ID || store.data.guildId || null;
}

// true if the invite works, false if Discord says it's gone. Other errors (network...) count as valid.
async function checkInvite(client, code) {
    try {
        const invite = await client.fetchInvite(code);
        if (invite.guild && invite.guild.id !== store.data.guildId) save({ guildId: invite.guild.id });
        return true;
    } catch (err) {
        if (err.code === RESTJSONErrorCodes.UnknownInvite) return false;
        console.error("Couldn't check the support invite:", err.message);
        return true;
    }
}

async function findReplacement(client) {
    const guild = client.guilds.cache.get(supportGuildId());
    if (!guild) return null;
    if (guild.vanityURLCode) return guild.vanityURLCode;

    // Reuse a permanent invite that already exists (listing invites needs Manage Server)
    if (guild.members.me.permissions.has(PermissionFlagsBits.ManageGuild)) {
        const invites = await guild.invites.fetch().catch(() => null);
        const permanent = invites?.find(i => !i.maxAge && !i.maxUses && !i.temporary);
        if (permanent) return permanent.code;
    }
    const invite = await createPermanentInvite(guild, { reason: "Support invite stopped working" });
    return invite?.code ?? null;
}

// Returns a working discord.gg link to the Shirox server, or null if there's none and the bot can't make one
async function getSupportInviteUrl(client) {
    let code = currentCode();
    if (code && Date.now() - lastValidAt < RECHECK_MS) return `https://discord.gg/${code}`;

    if (!code || !(await checkInvite(client, code))) {
        code = await findReplacement(client).catch(err => {
            console.error("Couldn't replace the support invite:", err.message);
            return null;
        });
        if (!code) return null;
        save({ code });
    }
    lastValidAt = Date.now();
    return `https://discord.gg/${code}`;
}

// Owner override. Returns false if the invite doesn't work.
async function setSupportInvite(client, input) {
    const code = toCode(input);
    if (!code || !(await checkInvite(client, code))) return false;
    save({ code });
    lastValidAt = Date.now();
    return true;
}

module.exports = { getSupportInviteUrl, setSupportInvite };
