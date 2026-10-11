const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

// Parses strings like "30s", "10m", "2h", "1d", "1w" into milliseconds. Returns null if invalid.
function parseDuration(input) {
    const match = input.trim().toLowerCase().match(/^(\d+)\s*(s|m|h|d|w)$/);
    if (!match) return null;
    const ms = parseInt(match[1]) * UNIT_MS[match[2]];
    return ms > 0 ? ms : null;
}

function formatDuration(ms) {
    const parts = [];
    for (const [unit, size] of [["d", UNIT_MS.d], ["h", UNIT_MS.h], ["m", UNIT_MS.m], ["s", UNIT_MS.s]]) {
        const amount = Math.floor(ms / size);
        if (amount) parts.push(`${amount}${unit}`);
        ms %= size;
    }
    return parts.join(" ") || "0s";
}

module.exports = { parseDuration, formatDuration };
