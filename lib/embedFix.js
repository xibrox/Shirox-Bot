// Social sites whose links embed badly in Discord, and "fix" services that serve proper embeds for them.
// Each server picks a service per platform; the first one is the default. Swap or add services here
// when one goes down.
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

// A platform service choice: the chosen host, "off", or the default (first) service when unset
// or when the chosen one has since been removed from the list
function serviceFor(platform, choices) {
    const chosen = choices[platform.id];
    return chosen === "off" || platform.services.some(([host]) => host === chosen) ? chosen : platform.services[0][0];
}

// The fixed version of `link`, or null if it isn't a post on a supported platform
function fixLink(link, choices) {
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
        const service = serviceFor(platform, choices);
        if (service === "off") return null;
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
function fixLinks(content, choices = {}) {
    const code = [...content.matchAll(CODE_REGEX)].map(m => [m.index, m.index + m[0].length]);
    const fixed = [];
    for (const match of content.matchAll(URL_REGEX)) {
        if (match[0].startsWith("<") || insideAny(code, match.index)) continue;
        const link = fixLink(match[0].replace(TRAILING, ""), choices);
        if (link) fixed.push(isSpoilered(content, match.index) ? `||${link}||` : link);
    }
    return [...new Set(fixed)].slice(0, MAX_LINKS);
}

module.exports = { PLATFORMS, fixLinks, serviceFor };
