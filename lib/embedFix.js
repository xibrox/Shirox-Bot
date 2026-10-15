const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");

// Social sites whose links embed badly in Discord, and "fix" services that serve proper embeds for them.
// Every service stays available: each server puts them in its preferred order (the first is used), and
// whoever posted a link can switch its reply to another service. Add services here as new ones appear.
const PLATFORMS = [
    {
        id: "twitter", label: "X / Twitter", emoji: "🐦",
        domains: ["twitter.com", "x.com"], post: /\/status\//,
        services: [["fxtwitter.com", "FxTwitter"], ["fixupx.com", "FixupX"], ["vxtwitter.com", "vxTwitter"], ["fixvx.com", "FixVX"]],
    },
    {
        id: "tiktok", label: "TikTok", emoji: "🎵",
        domains: ["tiktok.com"], post: /\/(video|photo)\/|^\/t\//, shortSubdomains: ["vm", "vt"],
        services: [["tnktok.com", "tnktok"], ["vxtiktok.com", "vxTikTok"], ["tiktxk.com", "tiktxk"]],
    },
    {
        id: "instagram", label: "Instagram", emoji: "📸",
        domains: ["instagram.com"], post: /^\/(p|reel|reels|tv)\//,
        services: [["kkinstagram.com", "kkinstagram"], ["ddinstagram.com", "ddinstagram"], ["instagramez.com", "InstagramEZ"]],
    },
    {
        id: "reddit", label: "Reddit", emoji: "👽",
        domains: ["reddit.com"], post: /\/comments\/|\/s\//,
        services: [["rxddit.com", "rxddit"], ["vxreddit.com", "vxReddit"]],
    },
    {
        id: "bluesky", label: "Bluesky", emoji: "🦋",
        domains: ["bsky.app"], post: /\/post\//,
        services: [["fxbsky.app", "FxBluesky"], ["bskyx.app", "bskyx"]],
    },
    {
        id: "pixiv", label: "Pixiv", emoji: "🎨",
        domains: ["pixiv.net"], post: /\/artworks\//,
        services: [["phixiv.net", "phixiv"]],
    },
];

// Subdomains that only mean "the normal site" and are dropped when rewriting
const PLAIN_SUBDOMAINS = ["www", "mobile", "m", "old", "new", "np"];
const URL_REGEX = /<?https?:\/\/[^\s<>]+/g;
const CODE_REGEX = /```[\s\S]*?```|`[^`\n]+`/g;
// Punctuation that ends a sentence or wraps a link rather than being part of it
const TRAILING = /[)\].,!?'"`|>]+$/;
const MAX_LINKS = 5;

// A server's settings: { order: { [platformId]: [hosts] }, off: [platformIds] }.
// Configs from the older version saved one chosen host (or "off") per platform; those still count.
function settingsFrom(config) {
    const legacy = config.embedFixServices ?? {};
    const order = { ...config.embedFixOrder };
    for (const [id, host] of Object.entries(legacy)) if (host !== "off" && !order[id]) order[id] = [host];
    const off = config.embedFixOff ?? Object.keys(legacy).filter(id => legacy[id] === "off");
    return { order, off };
}

// A platform's services in the server's order. Services missing from the saved order (added later)
// follow in their default order; ones that were removed are dropped.
function orderFor(platform, settings = {}) {
    const known = platform.services.map(([host]) => host);
    const saved = (settings.order?.[platform.id] ?? []).filter(host => known.includes(host));
    return [...saved, ...known.filter(host => !saved.includes(host))];
}

const isOff = (platform, settings = {}) => !!settings.off?.includes(platform.id);
const serviceName = (platform, host) => platform.services.find(([h]) => h === host)?.[1] ?? host;

// The fixed version of `link`, or null if it isn't a post on a supported platform
function fixLink(link, settings) {
    let url;
    try {
        url = new URL(link);
    } catch {
        return null;
    }
    const host = url.hostname.toLowerCase();
    for (const platform of PLATFORMS) {
        const domain = platform.domains.find(d => host === d || host.endsWith(`.${d}`));
        if (!domain) continue;
        const subdomain = host === domain ? "" : host.slice(0, -domain.length - 1);
        const isShortLink = platform.shortSubdomains?.includes(subdomain);
        if (!isShortLink && !platform.post.test(url.pathname)) return null;
        if (isOff(platform, settings)) return null;
        const service = orderFor(platform, settings)[0];
        url.hostname = subdomain && !PLAIN_SUBDOMAINS.includes(subdomain) ? `${subdomain}.${service}` : service;
        return url.toString();
    }
    return null;
}

const insideAny = (ranges, index) => ranges.some(([start, end]) => index >= start && index < end);
// An odd number of || before the link means it's inside a spoiler
const isSpoilered = (content, index) => (content.slice(0, index).match(/\|\|/g) ?? []).length % 2 === 1;

// Fixed links for every supported post in a message. Links in <> or code were deliberately left
// unembedded, so they're skipped; spoilered links stay spoilered.
function fixLinks(content, settings = {}) {
    const code = [...content.matchAll(CODE_REGEX)].map(m => [m.index, m.index + m[0].length]);
    const fixed = [];
    for (const match of content.matchAll(URL_REGEX)) {
        if (match[0].startsWith("<") || insideAny(code, match.index)) continue;
        const link = fixLink(match[0].replace(TRAILING, ""), settings);
        if (link) fixed.push(isSpoilered(content, match.index) ? `||${link}||` : link);
    }
    return [...new Set(fixed)].slice(0, MAX_LINKS);
}

// Links in a bot reply that point at a fix service: [{ platform, host }], one per platform
function platformsIn(content) {
    const found = new Map();
    for (const match of content.matchAll(/https?:\/\/[^\s|<>]+/g)) {
        let hostname;
        try {
            hostname = new URL(match[0]).hostname;
        } catch {
            continue;
        }
        for (const platform of PLATFORMS) {
            const host = platform.services.map(([h]) => h).find(h => hostname === h || hostname.endsWith(`.${h}`));
            if (host && !found.has(platform.id)) found.set(platform.id, { platform, host });
        }
    }
    return [...found.values()];
}

// Swaps one platform's links in a reply to another service, keeping spoilers, short-link subdomains and other links
function switchService(content, platformId, newHost) {
    const known = PLATFORMS.find(p => p.id === platformId).services.map(([h]) => h);
    return content.replace(/https?:\/\/[^\s|<>]+/g, link => {
        let url;
        try {
            url = new URL(link);
        } catch {
            return link;
        }
        const current = known.find(h => url.hostname === h || url.hostname.endsWith(`.${h}`));
        if (!current) return link;
        url.hostname = url.hostname.slice(0, -current.length) + newHost;
        return url.toString();
    });
}

// Under a reply: a menu per platform so the poster can switch services if one doesn't embed
function serviceMenus(content, authorId, settings) {
    return platformsIn(content).slice(0, 5).map(({ platform, host }) => new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`embedfix:switch:${platform.id}:${authorId}`)
            .setPlaceholder(`${platform.emoji} ${platform.label} not embedding? Try another service`)
            .addOptions(orderFor(platform, settings).map(h => ({ label: serviceName(platform, h), description: h, value: h, default: h === host }))),
    ));
}

module.exports = { PLATFORMS, fixLinks, settingsFrom, orderFor, isOff, serviceName, switchService, serviceMenus };
