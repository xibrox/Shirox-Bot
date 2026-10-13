// Turns GitHub commits into a readable changelog: AI through OpenRouter's free models,
// with a rule-based fallback if every model fails

const GITHUB_API = "https://api.github.com";
const OPENROUTER_API = "https://openrouter.ai/api/v1";

// Build bumps, CI and other housekeeping users never see
const NOISE = /\[skip ci\]|^(chore|ci|build|test|docs|style|refactor)(\(.*?\))?!?:|^merge\b|^bump\b|^revert\b/i;

async function github(path) {
    const headers = { Accept: "application/vnd.github+json", "User-Agent": "shirox-bot" };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const res = await fetch(`${GITHUB_API}${path}`, { headers, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(`GitHub ${res.status}: ${body.message ?? res.statusText}`);
    }
    return res.json();
}

const toCommit = c => {
    const [title, ...body] = c.commit.message.trim().split("\n");
    return { sha: c.sha, title: title.trim(), body: body.join("\n").trim(), url: c.html_url, merge: c.parents.length > 1 };
};

// Commits after `sinceSha`, or after `sinceDate`, or the latest few. Oldest first, merges left out.
async function fetchNewCommits(repo, { sinceSha, sinceDate } = {}) {
    let commits;
    if (sinceSha) {
        const { default_branch } = await github(`/repos/${repo}`);
        const compare = await github(`/repos/${repo}/compare/${sinceSha}...${default_branch}`);
        commits = compare.commits.map(toCommit);
    } else {
        const query = sinceDate ? `per_page=100&since=${sinceDate.toISOString()}` : "per_page=20";
        commits = (await github(`/repos/${repo}/commits?${query}`)).map(toCommit).reverse();
    }
    return commits.filter(c => !c.merge);
}

// The newest build number a list of commits sets ("Bump the build to 120" → "120")
const buildNumber = commits => commits.map(c => c.title.match(/\bbuild (?:to |number )?(\d+)/i)?.[1]).filter(Boolean).at(-1);

// The commit that set the build number to `build`, among the latest 100. Pass the same `cache`
// object to look up several builds with a single GitHub request.
async function findBuildCommit(repo, build, cache = {}) {
    cache.commits ??= github(`/repos/${repo}/commits?per_page=100`).then(list => list.map(toCommit));
    return (await cache.commits).find(c => buildNumber([c]) === String(build)) ?? null;
}

// ===== AI =====

const SYSTEM_PROMPT = `You write update posts for a Discord server about an app. You get raw git commit messages and turn them into a short changelog that normal users understand.

Rules:
- Only include changes a user would notice. Skip build bumps, CI, refactors, project files, build scripts and other housekeeping.
- Combine commits about the same thing into one bullet.
- Group bullets under short bold headings by area, like **Player**, **Downloads** or **Mac**. Use 2 to 6 headings. If there are fewer than 4 bullets, skip the headings.
- Every bullet starts with "- " and is one plain sentence of about 15 words or less. Say what changed for the user, not how it was coded.
- Write like the developer posting a quick update for friends: plain, direct, a little casual.
- Never use em dashes or en dashes. Use commas or periods instead.
- Avoid hype and filler words like excited, thrilled, enhanced, seamless, streamlined, robust, elevate, revamped, delve, overhaul, experience, various improvements.
- No intro line, no closing line, no exclamation marks, no emojis.
- Never invent anything that is not in the commits.

Reply in exactly this format and nothing else:
TITLE: <short title, at most 8 words, include the build number if one is given>

<the changelog in Discord markdown>`;

// Model list cached for an hour, so models leaving the free tier drop out on their own
let freeModels = { list: [], fetchedAt: 0 };
// Not chat models, or too weak for this
const UNSUITABLE = /safety|guard|lyria|embed|tts|whisper|\b\d(\.\d)?b\b|-[0-9.]+b:|mini-code/i;
// Tried first when available
const PREFERRED = [/nemotron-3-ultra/, /nemotron-3-super/, /gemma-4-31b/, /gemma/];
// Models that refused us outright (not just busy) are skipped for a day
const blocked = new Map();
const isBlocked = model => (blocked.get(model) ?? 0) > Date.now();

async function getFreeModels() {
    if (Date.now() - freeModels.fetchedAt < 3_600_000) return freeModels.list;
    try {
        const res = await fetch(`${OPENROUTER_API}/models`, { signal: AbortSignal.timeout(15_000) });
        const { data } = await res.json();
        const list = data
            .filter(m => m.pricing?.prompt === "0" && m.pricing?.completion === "0")
            .filter(m => m.architecture?.output_modalities?.includes("text") ?? true)
            // openrouter/free is left out: it often routes to tiny or safety-check models
            .filter(m => !UNSUITABLE.test(m.id) && m.id !== "openrouter/free")
            .map(m => m.id);
        const rank = id => { const i = PREFERRED.findIndex(re => re.test(id)); return i === -1 ? PREFERRED.length : i; };
        freeModels = { list: list.sort((a, b) => rank(a) - rank(b)), fetchedAt: Date.now() };
    } catch (err) {
        console.error("Couldn't load OpenRouter models:", err.message);
    }
    return freeModels.list;
}

// Removes the usual AI tells that slip through anyway
function humanize(text) {
    return text
        .replace(/<think>[\s\S]*?<\/think>/g, "")
        .replace(/^```\w*\n?|```$/gm, "")
        .replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2")
        .replace(/\s*[—–]\s*/g, ", ")
        .replace(/^(\s*)[*•]\s+/gm, "$1- ")
        .replace(/!(?=\s|$)/g, ".")
        .replace(/^(- .*[^.])\.$/gm, "$1")
        .trim();
}

function parseReply(reply) {
    const text = humanize(reply);
    const titleMatch = text.match(/^\s*\**TITLE:?\**\s*(.+)$/im);
    const title = titleMatch?.[1].replace(/\*+/g, "").trim();
    const body = (titleMatch ? text.slice(titleMatch.index + titleMatch[0].length) : text).trim();
    if (!/^- /m.test(body)) return null;
    return { title, body };
}

async function askModel(model, commits, appName, signal) {
    const list = commits
        .map(c => `- ${c.title}${c.body ? `\n  ${c.body.slice(0, 400).replace(/\n/g, "\n  ")}` : ""}`)
        .join("\n")
        .slice(0, 60_000);
    const res = await fetch(`${OPENROUTER_API}/chat/completions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "X-Title": "Shirox Bot",
        },
        body: JSON.stringify({
            model,
            temperature: 0.4,
            max_tokens: 4000,
            reasoning: { effort: "low", exclude: true },
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: `App: ${appName}\nCommits, oldest first:\n${list}` },
            ],
        }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(90_000)]),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
        const status = data.error?.code ?? res.status;
        const message = data.error?.message ?? `HTTP ${res.status}`;
        if ((status >= 400 && status < 500 && status !== 429) || /only available/i.test(message)) {
            blocked.set(model, Date.now() + 86_400_000);
        }
        throw new Error(message);
    }
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = parseReply(content);
    if (!parsed) throw new Error(`reply had no bullet list: ${JSON.stringify(content.slice(0, 150))}`);
    return { ...parsed, model: data.model ?? model };
}

// ===== Rule-based fallback =====

const CONVENTIONAL_AREAS = { feat: "New", fix: "Fixes", perf: "Faster" };

function ruleBased(commits) {
    const groups = new Map();
    for (const c of commits) {
        if (NOISE.test(c.title)) continue;
        const match = c.title.match(/^([\w &/+-]{2,30})(?:\(.*?\))?:\s+(.+)$/);
        const area = match ? CONVENTIONAL_AREAS[match[1].toLowerCase()] ?? match[1].trim() : "Other";
        const text = humanize(match ? match[2] : c.title);
        if (!groups.has(area)) groups.set(area, []);
        groups.get(area).push(`- ${text[0].toUpperCase()}${text.slice(1).replace(/\.$/, "")}`);
    }
    if (groups.size === 1 && groups.has("Other")) return groups.get("Other").join("\n");
    return [...groups].map(([area, lines]) => `**${area}**\n${lines.join("\n")}`).join("\n\n");
}

// Embed descriptions max out at 4096 characters; cut at a line break
function fit(body) {
    if (body.length <= 4000) return body;
    return `${body.slice(0, 3990).replace(/\n[^\n]*$/, "")}\n…`;
}

// Returns { title, body, model } where model is null when the AI wasn't used
async function writeChangelog(commits, repo) {
    const appName = repo.split("/")[1];
    const build = buildNumber(commits);
    const fallbackTitle = build ? `${appName} build ${build}` : `${appName} update`;
    const useful = commits.filter(c => !/\[skip ci\]/i.test(c.title));

    if (process.env.OPENROUTER_API_KEY && useful.length) {
        // Free models are often busy or return nothing, so ask a few at once and keep the first
        // good answer. If a whole batch fails, try the next one.
        const models = (await getFreeModels()).filter(m => !isBlocked(m));
        for (let i = 0; i < Math.min(models.length, 8); i += 4) {
            const controller = new AbortController();
            const batch = models.slice(i, i + 4).map(model => askModel(model, useful, appName, controller.signal)
                .catch(err => { console.error(`Changelog model ${model} failed:`, err.message); throw err; }));
            try {
                const result = await Promise.any(batch);
                return { title: result.title || fallbackTitle, body: fit(result.body), model: result.model };
            } catch {
                // every model in the batch failed
            } finally {
                controller.abort();
            }
        }
    }
    return { title: fallbackTitle, body: fit(ruleBased(commits) || "- Small fixes and behind the scenes work"), model: null };
}

module.exports = { fetchNewCommits, findBuildCommit, writeChangelog };
