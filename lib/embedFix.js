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
const PLAIN_SUBDOMAINS = ["www", "mobile", "m", "old", "new"];
const URL_REGEX = /<?https?:\/\/[^\s<>]+>?/g;
const MAX_LINKS = 5;

// A platform service choice: the chosen host, "off", or the default (first) service when unset
const serviceFor = (platform, choices) => choices[platform.id] ?? platform.services[0][0];

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

// Fixed links for every supported post in a message (links in <> were deliberately unembedded, so they're skipped)
function fixLinks(content, choices = {}) {
    const fixed = (content.match(URL_REGEX) ?? [])
        .filter(match => !match.startsWith("<"))
        .map(match => fixLink(match.replace(/>$/, ""), choices))
        .filter(Boolean);
    return [...new Set(fixed)].slice(0, MAX_LINKS);
}

module.exports = { PLATFORMS, fixLinks, serviceFor };
