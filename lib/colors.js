// Embed color palette. Change values here to re-theme the whole bot.
const COLORS = {
    default: "#FFFFFF", // general info, menus, panels
    danger: "#ED4245", // destructive: deletions, bans, kicks, leaves, honeypot, automod
    warning: "#F39C12", // warnings, timeouts
    success: "#57F287", // joins, unbans, things created/restored
    update: "#FEE75C", // edits: messages, nicknames, roles
    muted: "#747F8D", // closed or inactive things
};

module.exports = { COLORS, EMBED_COLOR: COLORS.default };
