# /setup Dashboard v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pause/resume, log types, editable text with previews for every posted embed, consistent button names, and a self-role panel manager to the `/setup` dashboard.

**Architecture:**
- **Features:** a new `lib/features.js` maps each channel feature to its config keys and decides whether it's active. Events and `sendLog` use it, and `sendLog` gains a log type.
- **Sections:** each `/setup` section file grows its controls using new `lib/setup/ui.js` helpers.
- **Self-role panels:** stored in a new `lib/selfRolePanels.js` store, and the self-roles section is rewritten into list, new and edit views.

**Tech Stack:** Bun, discord.js 14.27, `bun test`.

**Spec:** `docs/superpowers/specs/2026-10-15-setup-dashboard-v2-design.md` (builds on `2026-10-15-setup-dashboard-design.md`).

## Global Constraints

- Use bun only.
- Button naming, from the spec's table:

  | Kind | Label | Style |
  |---|---|---|
  | Pause/resume | `⏸️ Pause` / `▶️ Resume` | Secondary / Success, disabled when the feature has no channel |
  | Clear everything | `Disable` / `Disable for <who>` | Danger |
  | On/off setting | `toggleButton` → `<Name>: on/off` | |
  | Edit text | `✏️ …` | |
  | Private preview | `👁️ Preview…` | |
  | Public post | `📤 Post…` | Primary |
  | Navigation | `◀ Home` / `◀ Back` | |

- Every section view keeps at most 5 rows and 25 menu options, its last row ends with `◀ Home`, and custom IDs stay at most 100 characters.
- Empty text fields delete their key, so the default is used.
- Code style:
  - `lib/` and `test/`: double quotes, 4 spaces.
  - `commands/`: single quotes, 2 spaces.
  - Comments are sparse and explain why.
- Commits use plain messages with **no** `Co-Authored-By`.

## Review Focus

- **Paused features must really stop.** The welcome and goodbye greetings, every `sendLog`, and the honeypot must each check `isActive`. Task 1 tests welcome, honeypot and sendLog. Goodbye and messageLogs are checked by a grep step.
- **Every `sendLog` call must pass a valid type.** A wrong argument order would send `embed` as the type and crash on `.send`. A grep step in Task 1 checks this.
- **Self-role panels whose message or channel was deleted** must be removed from the list with a notice, not crash (Task 7).
- **Adopting a panel from a malformed link, another server's link, a link to a user's message, or a message without `selfrole:` buttons** must give the matching notice (Task 7).
- **Previews must not be able to toggle roles.** Preview buttons are disabled (Task 7).

## File Structure

- Create `lib/features.js`: `FEATURES`, `isActive`, `featureState`.
- Modify `lib/logger.js`: `LOG_TYPES`, and `sendLog(guild, type, embed, files)`.
- Modify events (`bans`, `automod`, `honeypot`, `memberUpdate`, `messageLogs`, `memberJoin`, `memberLeave`, `serverLogs`) and the commands that log (`warn`, `softban`): add a type to `sendLog`, and add the pause checks.
- Modify commands `welcome`, `goodbye`, `logs`, `honeypot`: set clears the pause flag, disable clears everything, show says when paused.
- Modify `lib/greetings.js`: title templates.
- Modify `lib/honeypot.js`: custom warning title/text.
- Modify `lib/faq.js`: custom panel title/text.
- Modify `lib/selfRoles.js`: `MAX_SELF_ROLES = 25`, `DEFAULT_SELF_ROLE_TEXT`.
- Create `lib/selfRolePanels.js`: the panel store, link parsing, reading a panel message.
- Modify `lib/setup/ui.js`: `pauseButton`, `disableButton`, `STATE_TEXT`, `featureStatus`, `togglePause`.
- Modify `lib/setup/sections/greeting.js`, `logs.js`, `honeypot.js`, `faq.js`, `autorole.js`.
- Rewrite `lib/setup/sections/selfroles.js`.
- Modify `commands/selfroles.js` (records panels), `commands/faqmanage.js` (custom panel text).
- Tests:
  - Create `test/limits.js` (shared Discord-limit assertions), `test/features.test.js`, `test/setupLogs.test.js`, `test/selfRolePanels.test.js`, `test/setupSelfRoles.test.js`.
  - Modify `test/fakes.js`, `test/setupViews.test.js`, `test/setupGreeting.test.js`, `test/setupHoneypotAutomod.test.js`, `test/setupFaqSelfRoles.test.js`.

---

### Task 1: Pause flags and log types in events

**Files:**
- Create: `lib/features.js`, `test/features.test.js`
- Modify: `test/fakes.js`, `lib/logger.js`, `events/bans.js`, `events/automod.js`, `events/honeypot.js`, `events/memberUpdate.js`, `events/messageLogs.js`, `events/memberJoin.js`, `events/memberLeave.js`, `events/serverLogs.js`, `commands/warn.js`, `commands/softban.js`, `commands/welcome.js`, `commands/goodbye.js`, `commands/logs.js`, `commands/honeypot.js`

**Interfaces:**
- Produces:
  - `lib/features.js` → `FEATURES: { welcome|goodbye|logs|honeypot: { channelKey, offKey } }`, `isActive(config, feature): boolean`, `featureState(config, feature): "on"|"paused"|"off"`.
  - `lib/logger.js` → `LOG_TYPES: { id, label, emoji }[]` (ids: messages, members, moderation, server, voice) and `sendLog(guild, type, embed, files = [])`.
  - `events/memberJoin.js` also exports `sendWelcome(member, config)`.
  - Fakes: `fakeChannel` gains `isTextBased()`. `fakeInteraction` gains `channelId: "here"` and `client: { user: { id: "bot" } }`.

- [ ] **Step 1: Extend the fakes**

In `test/fakes.js`:

- Add `isTextBased: () => true,` to the object returned by `fakeChannel`, after `toString`.
- Add `channelId: "here",` and `client: { user: { id: "bot" } },` to the `interaction` object in `fakeInteraction`, after `channel`.

- [ ] **Step 2: Write the failing tests**

`test/features.test.js`:

```js
const { describe, test, expect, mock } = require("bun:test");
const { PermissionsBitField } = require("discord.js");
const { isActive, featureState } = require("../lib/features");
const { updateGuildConfig } = require("../lib/guildConfig");
const { sendLog, createLogEmbed } = require("../lib/logger");
const memberJoin = require("../events/memberJoin");
const honeypotEvent = require("../events/honeypot");
const { fakeGuild, fakeChannel } = require("./fakes");

const KEYS = [
    ["welcome", "welcomeChannelId", "welcomeOff"],
    ["goodbye", "goodbyeChannelId", "goodbyeOff"],
    ["logs", "logChannelId", "logsOff"],
    ["honeypot", "honeypotChannelId", "honeypotOff"],
];

describe("isActive and featureState", () => {
    for (const [feature, channelKey, offKey] of KEYS) {
        test(`${feature}: off, on, paused`, () => {
            expect([isActive({}, feature), featureState({}, feature)]).toEqual([false, "off"]);
            expect([isActive({ [channelKey]: "c" }, feature), featureState({ [channelKey]: "c" }, feature)]).toEqual([true, "on"]);
            const paused = { [channelKey]: "c", [offKey]: true };
            expect([isActive(paused, feature), featureState(paused, feature)]).toEqual([false, "paused"]);
        });
    }
});

function fakeMember(guild) {
    return {
        id: "u1",
        guild,
        user: { username: "newbie", bot: false, createdTimestamp: Date.now(), displayAvatarURL: () => "https://cdn.example/a.png" },
        toString: () => "<@u1>",
    };
}

describe("paused features stay quiet", () => {
    test("welcome is only sent while active", async () => {
        const channel = fakeChannel();
        const guild = fakeGuild({ channels: [channel] });
        await memberJoin.sendWelcome(fakeMember(guild), { welcomeChannelId: channel.id, welcomeOff: true });
        expect(channel.send).not.toHaveBeenCalled();
        await memberJoin.sendWelcome(fakeMember(guild), { welcomeChannelId: channel.id });
        expect(channel.send).toHaveBeenCalledTimes(1);
    });

    test("the honeypot ignores messages while paused", async () => {
        const guild = fakeGuild();
        updateGuildConfig(guild.id, { honeypotChannelId: "trap", honeypotOff: true });
        const message = {
            inGuild: () => true,
            author: { bot: false },
            guild: { id: guild.id, ownerId: "owner" },
            channelId: "trap",
            member: { id: "u1", permissions: new PermissionsBitField(0n) },
            delete: mock(async () => {}),
        };
        await honeypotEvent.execute(message);
        expect(message.delete).not.toHaveBeenCalled();
    });
});

describe("sendLog", () => {
    function logGuild(config) {
        const channel = fakeChannel();
        const guild = fakeGuild({ channels: [channel] });
        updateGuildConfig(guild.id, { logChannelId: channel.id, ...config });
        return { guild, channel };
    }

    test("sends when logs are on and the type is on", async () => {
        const { guild, channel } = logGuild({});
        await sendLog(guild, "members", createLogEmbed("success", "📥 Member joined"));
        expect(channel.send.mock.calls[0][0].embeds[0].toJSON().title).toBe("📥 Member joined");
    });

    test("skips everything while paused", async () => {
        const { guild, channel } = logGuild({ logsOff: true });
        await sendLog(guild, "members", createLogEmbed("success", "x"));
        expect(channel.send).not.toHaveBeenCalled();
    });

    test("skips types that are switched off", async () => {
        const { guild, channel } = logGuild({ logTypesOff: ["voice"] });
        await sendLog(guild, "voice", createLogEmbed("default", "x"));
        expect(channel.send).not.toHaveBeenCalled();
        await sendLog(guild, "server", createLogEmbed("default", "x"));
        expect(channel.send).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test test/features.test.js`
Expected: FAIL with `Cannot find module '../lib/features'`.

- [ ] **Step 4: Create `lib/features.js`**

```js
// Features that post to a channel; each can be paused without losing its settings
const FEATURES = {
    welcome: { channelKey: "welcomeChannelId", offKey: "welcomeOff" },
    goodbye: { channelKey: "goodbyeChannelId", offKey: "goodbyeOff" },
    logs: { channelKey: "logChannelId", offKey: "logsOff" },
    honeypot: { channelKey: "honeypotChannelId", offKey: "honeypotOff" },
};

// "on", "paused" (channel set but paused) or "off" (no channel)
function featureState(config, feature) {
    const { channelKey, offKey } = FEATURES[feature];
    if (!config[channelKey]) return "off";
    return config[offKey] ? "paused" : "on";
}

const isActive = (config, feature) => featureState(config, feature) === "on";

module.exports = { FEATURES, isActive, featureState };
```

- [ ] **Step 5: Give `sendLog` a type and a pause check**

In `lib/logger.js`:

- Add `const { isActive } = require("./features");` after the colors import.
- Add above `sendLog`:

```js
// Kinds of log entries a server can switch off in /setup → Logs
const LOG_TYPES = [
    { id: "messages", label: "Messages", emoji: "💬" },
    { id: "members", label: "Members", emoji: "👥" },
    { id: "moderation", label: "Moderation", emoji: "🛡️" },
    { id: "server", label: "Server", emoji: "🏠" },
    { id: "voice", label: "Voice", emoji: "🔊" },
];
```

- Replace the start of `sendLog`:

```js
async function sendLog(guild, embed, files = []) {
    const channelId = getGuildConfig(guild.id).logChannelId;
    if (!channelId) return;
    const channel = guild.channels.cache.get(channelId);
```

with:

```js
// `type` is one of LOG_TYPES' ids
async function sendLog(guild, type, embed, files = []) {
    const config = getGuildConfig(guild.id);
    if (!isActive(config, "logs") || config.logTypesOff?.includes(type)) return;
    const channel = guild.channels.cache.get(config.logChannelId);
```

- Add `LOG_TYPES` to `module.exports`.

- [ ] **Step 6: Pass a type at every call site**

Replace each call exactly. Where a file has several identical calls, they're listed in file order.

| File | Old | New |
|---|---|---|
| `events/bans.js` | `await sendLog(ban.guild, embed);` | `await sendLog(ban.guild, "moderation", embed);` |
| `events/automod.js` | `await sendLog(message.guild, embed);` | `await sendLog(message.guild, "moderation", embed);` |
| `events/honeypot.js` | `await sendLog(message.guild, embed);` | `await sendLog(message.guild, "moderation", embed);` |
| `events/memberUpdate.js` 1st (nickname) | `await sendLog(guild, embed);` | `await sendLog(guild, "members", embed);` |
| `events/memberUpdate.js` 2nd (roles) | `await sendLog(guild, embed);` | `await sendLog(guild, "members", embed);` |
| `events/memberUpdate.js` 3rd (timeout) | `await sendLog(guild, embed);` | `await sendLog(guild, "moderation", embed);` |
| `events/messageLogs.js` | `await sendLog(message.guild, embed, files);` | `await sendLog(message.guild, "messages", embed, files);` |
| `events/messageLogs.js` | `await sendLog(channel.guild, embed, files);` | `await sendLog(channel.guild, "messages", embed, files);` |
| `events/messageLogs.js` | `await sendLog(newMessage.guild, embed);` | `await sendLog(newMessage.guild, "messages", embed);` |
| `events/memberJoin.js` 1st (new account kicked) | `await sendLog(member.guild, embed);` | `await sendLog(member.guild, "moderation", embed);` |
| `events/memberJoin.js` 2nd (roles restored) | `await sendLog(member.guild, embed);` | `await sendLog(member.guild, "members", embed);` |
| `events/memberJoin.js` 3rd (joined) | `await sendLog(member.guild, embed);` | `await sendLog(member.guild, "members", embed);` |
| `events/memberLeave.js` | `await sendLog(member.guild, embed);` | `await sendLog(member.guild, kick ? "moderation" : "members", embed);` |
| `events/serverLogs.js` (voice) | `await sendLog(newState.guild, embed);` | `await sendLog(newState.guild, "voice", embed);` |
| `events/serverLogs.js` (both channel calls) | `await sendLog(channel.guild, embed);` | `await sendLog(channel.guild, "server", embed);` |
| `events/serverLogs.js` (both role calls) | `await sendLog(role.guild, embed);` | `await sendLog(role.guild, "server", embed);` |
| `commands/warn.js` | `await sendLog(interaction.guild, embed);` | `await sendLog(interaction.guild, 'moderation', embed);` |
| `commands/softban.js` | `await sendLog(interaction.guild, embed);` | `await sendLog(interaction.guild, 'moderation', embed);` |

- [ ] **Step 7: Respect pause in the events**

- `events/memberJoin.js`:
  - Add `const { isActive } = require("../lib/features");` after the guildConfig import.
  - In `sendWelcome`, replace `if (!config.welcomeChannelId) return;` with `if (!isActive(config, "welcome")) return;`.
  - Change `module.exports = {` to start with `sendWelcome,` as its first property, before `name`.
- `events/memberLeave.js`: add the same import, and replace `if (config.goodbyeChannelId) {` with `if (isActive(config, "goodbye")) {`.
- `events/messageLogs.js`: add the same import, and replace `if (!getGuildConfig(message.guild.id).logChannelId || isLogChannel(message.channel)) return;` with `if (!isActive(getGuildConfig(message.guild.id), "logs") || isLogChannel(message.channel)) return;`.
- `events/honeypot.js`: add the same import, and replace `if (!config.honeypotChannelId || message.channelId !== config.honeypotChannelId) return;` with `if (!isActive(config, "honeypot") || message.channelId !== config.honeypotChannelId) return;`.

- [ ] **Step 8: Slash commands clear and show the pause flag**

- `commands/welcome.js`:
  - In `handleComponent`, change the save to `updateGuildConfig(interaction.guild.id, { welcomeChannelId: draft.channelId, welcomeMessage: draft.message, welcomeOff: null });`.
  - In `disable`, change to `updateGuildConfig(interaction.guild.id, { welcomeChannelId: null, welcomeMessage: null, welcomeTitle: null, welcomeOff: null });`.
  - In `show`, change the content to ``content: `📢 Channel: <#${config.welcomeChannelId}>\n💬 Message: ${config.welcomeMessage || '*default*'}${config.welcomeOff ? '\n⏸️ Paused' : ''}`,``.
- `commands/goodbye.js`: the same three changes with `goodbye` keys.
- `commands/logs.js`:
  - The set save becomes `updateGuildConfig(interaction.guild.id, { logChannelId: channel.id, logsOff: null });`.
  - Disable becomes `updateGuildConfig(interaction.guild.id, { logChannelId: null, logsOff: null, logTypesOff: null });`.
  - In show, replace `const { logChannelId } = getGuildConfig(interaction.guild.id);` with `const { logChannelId, logsOff } = getGuildConfig(interaction.guild.id);` and the content with ``content: logChannelId ? `📜 Logs are sent to <#${logChannelId}>.${logsOff ? ' ⏸️ Paused.' : ''}` : 'Logging is *disabled*.',``.
- `commands/honeypot.js`:
  - The set save becomes `updateGuildConfig(interaction.guild.id, { honeypotChannelId: channel.id, honeypotAction: action, honeypotOff: null });`.
  - Disable becomes `updateGuildConfig(interaction.guild.id, { honeypotChannelId: null, honeypotAction: null, honeypotOff: null, honeypotWarningTitle: null, honeypotWarningText: null });`.
  - In show, append `${config.honeypotOff ? '\n⏸️ Paused' : ''}` to the end of the enabled template string, after `**`.

- [ ] **Step 9: Run tests and the call-site checks**

Run: `bun test`
Expected: PASS, 0 fail. That includes the 10 new tests in `features.test.js`.

Run: `grep -rn "sendLog(" events commands lib | grep -v "function sendLog" | grep -vE "sendLog\([^,]+, (\"|'|kick \?)"`
Expected: no output. Every call has a type as its second argument.

Run: `grep -n "isActive" events/memberJoin.js events/memberLeave.js events/messageLogs.js events/honeypot.js lib/logger.js | wc -l`
Expected: `10`. That is one import plus one use in each of the 5 files.

Run: `bun -e "for (const f of ['welcome','goodbye','logs','honeypot','warn','softban']) require('./commands/'+f).data.toJSON(); for (const f of require('fs').readdirSync('events')) require('./events/'+f); console.log('ok')"`
Expected: `ok`

- [ ] **Step 10: Commit**

```bash
git add lib/features.js lib/logger.js events commands/warn.js commands/softban.js commands/welcome.js commands/goodbye.js commands/logs.js commands/honeypot.js test/fakes.js test/features.test.js
git commit -m "Let features be paused and logs filtered by type"
```

---

### Task 2: Welcome and Goodbye: pause, title and text, preview

**Files:**
- Modify: `lib/setup/ui.js`, `lib/greetings.js`, `events/memberJoin.js`, `events/memberLeave.js`, `commands/welcome.js`, `commands/goodbye.js`, `lib/setup/sections/greeting.js`, `lib/setup/sections/welcome.js`, `lib/setup/sections/goodbye.js`
- Test: rewrite `test/setupGreeting.test.js`

**Interfaces:**
- Consumes: `FEATURES`, `featureState` (Task 1).
- Produces:
  - `lib/setup/ui.js` gains:
    - `STATE_TEXT`
    - `pauseButton(customId, state)`
    - `disableButton(customId, enabled, label = "Disable")`
    - `featureStatus(config, feature)` → `"on · <#id>" | "paused · <#id>" | "off"`
    - `togglePause(guildId, feature)` → `"paused" | "resumed" | null` (null when the feature has no channel)
  - `lib/greetings.js`:
    - `DEFAULT_WELCOME_TITLE`, `DEFAULT_GOODBYE_TITLE`
    - `buildGreetingEmbed(member, template, joining, title?)`
    - `sendGreeting(member, channelId, template, joining, title?)`
  - Greeting sections use custom IDs `setup:<id>:channel|text|preview|pause|disable`, and the modal `setup:<id>:text`.

- [ ] **Step 1: Rewrite the failing tests**

Replace `test/setupGreeting.test.js` with:

```js
const { test, expect } = require("bun:test");
const { MessageFlags } = require("discord.js");
const setup = require("../commands/setup");
const { getGuildConfig, updateGuildConfig } = require("../lib/guildConfig");
const { buildGreetingEmbed } = require("../lib/greetings");
const { fakeGuild, fakeChannel, fakeInteraction } = require("./fakes");

const update = interaction => interaction.update.mock.calls[0][0];
const fakeMember = guild => ({
    guild,
    user: { username: "newbie", createdTimestamp: Date.now(), displayAvatarURL: () => "https://cdn.example/a.png" },
    toString: () => "<@u1>",
});

test("picking a channel turns welcome on and keeps the text", async () => {
    const channel = fakeChannel();
    const guild = fakeGuild({ channels: [channel] });
    updateGuildConfig(guild.id, { welcomeMessage: "Hi {user}" });
    const interaction = fakeInteraction({ guild, customId: "setup:welcome:channel", values: [channel.id] });
    await setup.handleComponent(interaction);
    expect(getGuildConfig(guild.id)).toMatchObject({ welcomeChannelId: channel.id, welcomeMessage: "Hi {user}" });
    expect(update(interaction).content).toBe(`✅ Welcome messages will be sent in <#${channel.id}>.`);
});

test("Edit text opens a form prefilled with title and message", async () => {
    const interaction = fakeInteraction({ customId: "setup:welcome:text" });
    updateGuildConfig(interaction.guild.id, { welcomeTitle: "Hey {user}", welcomeMessage: "Hi {user}" });
    await setup.handleComponent(interaction);
    const modal = interaction.showModal.mock.calls[0][0].toJSON();
    expect(modal.custom_id).toBe("setup:welcome:text");
    expect(modal.components.map(row => row.components[0].value)).toEqual(["Hey {user}", "Hi {user}"]);
});

test("saving text without a channel says to pick one", async () => {
    const interaction = fakeInteraction({ customId: "setup:welcome:text", fields: { title: "Hey", message: "Hello {user}" } });
    await setup.handleModal(interaction);
    expect(getGuildConfig(interaction.guild.id)).toMatchObject({ welcomeTitle: "Hey", welcomeMessage: "Hello {user}" });
    expect(update(interaction).content).toBe("✅ Text saved. Pick a channel to turn it on.");
});

test("empty fields go back to the defaults", async () => {
    const interaction = fakeInteraction({ customId: "setup:welcome:text", fields: { title: " ", message: "   " } });
    updateGuildConfig(interaction.guild.id, { welcomeChannelId: "c1", welcomeTitle: "Old", welcomeMessage: "Old" });
    await setup.handleModal(interaction);
    expect(getGuildConfig(interaction.guild.id).welcomeTitle).toBeUndefined();
    expect(getGuildConfig(interaction.guild.id).welcomeMessage).toBeUndefined();
    expect(update(interaction).content).toBe("✅ Text saved.");
});

test("Pause keeps the settings and Resume turns it back on", async () => {
    const guild = fakeGuild();
    updateGuildConfig(guild.id, { welcomeChannelId: "c1", welcomeMessage: "Hi" });
    const pause = fakeInteraction({ guild, customId: "setup:welcome:pause" });
    await setup.handleComponent(pause);
    expect(getGuildConfig(guild.id)).toMatchObject({ welcomeChannelId: "c1", welcomeMessage: "Hi", welcomeOff: true });
    expect(update(pause).content).toBe("⏸️ Welcome messages paused. Your settings are kept.");

    const resume = fakeInteraction({ guild, customId: "setup:welcome:pause" });
    await setup.handleComponent(resume);
    expect(getGuildConfig(guild.id).welcomeOff).toBeUndefined();
    expect(update(resume).content).toBe("▶️ Welcome messages resumed.");
});

test("Pause without a channel asks for one", async () => {
    const interaction = fakeInteraction({ customId: "setup:welcome:pause" });
    await setup.handleComponent(interaction);
    expect(getGuildConfig(interaction.guild.id).welcomeOff).toBeUndefined();
    expect(update(interaction).content).toBe("❌ Pick a channel first.");
});

test("Disable clears channel, text and pause", async () => {
    const interaction = fakeInteraction({ customId: "setup:welcome:disable" });
    updateGuildConfig(interaction.guild.id, { welcomeChannelId: "c1", welcomeMessage: "Hi", welcomeTitle: "T", welcomeOff: true });
    await setup.handleComponent(interaction);
    expect(getGuildConfig(interaction.guild.id)).toEqual({});
    expect(update(interaction).content).toBe("✅ Welcome messages disabled.");
});

test("Preview shows the saved title privately", async () => {
    const guild = fakeGuild();
    updateGuildConfig(guild.id, { welcomeTitle: "Hey {user} in {server}" });
    const interaction = fakeInteraction({ guild, customId: "setup:welcome:preview" });
    interaction.member = fakeMember(guild);
    await setup.handleComponent(interaction);
    const reply = interaction.reply.mock.calls[0][0];
    expect(reply.flags).toBe(MessageFlags.Ephemeral);
    expect(reply.embeds[0].toJSON().title).toBe("Hey newbie in Test Server");
});

test("titles fall back to the defaults", () => {
    const guild = fakeGuild();
    expect(buildGreetingEmbed(fakeMember(guild), "Hi", true).toJSON().title).toBe("👋 Welcome to Test Server!");
    expect(buildGreetingEmbed(fakeMember(guild), "Bye", false).toJSON().title).toBe("👋 Goodbye!");
});

test("goodbye uses its own settings", async () => {
    const channel = fakeChannel();
    const guild = fakeGuild({ channels: [channel] });
    const interaction = fakeInteraction({ guild, customId: "setup:goodbye:channel", values: [channel.id] });
    await setup.handleComponent(interaction);
    expect(getGuildConfig(guild.id).goodbyeChannelId).toBe(channel.id);
    expect(getGuildConfig(guild.id).welcomeChannelId).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/setupGreeting.test.js`
Expected: FAIL. The `text`, `pause`, title-preview and default-title tests fail. The channel and goodbye tests may pass.

- [ ] **Step 3: Add the shared helpers to `lib/setup/ui.js`**

Add these imports at the top, after the discord.js import:

```js
const { getGuildConfig, updateGuildConfig } = require("../guildConfig");
const { FEATURES, featureState } = require("../features");
```

Add before `module.exports`:

```js
const STATE_TEXT = { on: "✅ on", paused: "⏸️ paused", off: "❌ off" };

// ⏸️ Pause while running, ▶️ Resume while paused; nothing to pause until a channel is set
function pauseButton(customId, state) {
    const paused = state === "paused";
    return button(customId, paused ? "▶️ Resume" : "⏸️ Pause", paused ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(state === "off");
}

// Clears a feature's settings (pausing keeps them)
function disableButton(customId, enabled, label = "Disable") {
    return button(customId, label, ButtonStyle.Danger).setDisabled(!enabled);
}

// Home status line for a channel feature
function featureStatus(config, feature) {
    const state = featureState(config, feature);
    return state === "off" ? "off" : `${state} · <#${config[FEATURES[feature].channelKey]}>`;
}

// Flips a feature between paused and running. Returns "paused", "resumed", or null if it has no channel.
function togglePause(guildId, feature) {
    const config = getGuildConfig(guildId);
    const state = featureState(config, feature);
    if (state === "off") return null;
    updateGuildConfig(guildId, { [FEATURES[feature].offKey]: state === "on" ? true : null });
    return state === "on" ? "paused" : "resumed";
}
```

Add `STATE_TEXT, pauseButton, disableButton, featureStatus, togglePause` to `module.exports`.

- [ ] **Step 4: Title templates in `lib/greetings.js`**

- Add after `DEFAULT_GOODBYE`:

```js
const DEFAULT_WELCOME_TITLE = "👋 Welcome to {server}!";
const DEFAULT_GOODBYE_TITLE = "👋 Goodbye!";
```

- Add after `fillTemplate`:

```js
// Mentions don't render in embed titles, so {user} shows the username there
const fillTitle = (template, member) => fillTemplate(template.replaceAll("{user}", "{username}"), member).slice(0, 256);
```

- Change `function buildGreetingEmbed(member, template, joining) {` to `function buildGreetingEmbed(member, template, joining, title) {`, and its `.setTitle(...)` line to `.setTitle(fillTitle(title || (joining ? DEFAULT_WELCOME_TITLE : DEFAULT_GOODBYE_TITLE), member))`.
- Change `async function sendGreeting(member, channelId, template, joining) {` to `async function sendGreeting(member, channelId, template, joining, title) {`, and its `buildGreetingEmbed(member, template, joining)` to `buildGreetingEmbed(member, template, joining, title)`.
- Add `DEFAULT_WELCOME_TITLE, DEFAULT_GOODBYE_TITLE` to `module.exports`.
- Events:
  - `events/memberJoin.js` `sendWelcome`: change to `await sendGreeting(member, config.welcomeChannelId, template, true, config.welcomeTitle);`.
  - `events/memberLeave.js`: change to `await sendGreeting(member, config.goodbyeChannelId, template, false, config.goodbyeTitle);`.
- Slash previews:
  - In `commands/welcome.js`, change `buildGreetingEmbed(interaction.member, message || DEFAULT_WELCOME, true)` to `buildGreetingEmbed(interaction.member, message || DEFAULT_WELCOME, true, getGuildConfig(interaction.guild.id).welcomeTitle)`.
  - In `commands/goodbye.js`, the same with `DEFAULT_GOODBYE`, `false` and `goodbyeTitle`.

- [ ] **Step 5: Rewrite `lib/setup/sections/greeting.js`**

```js
const {
    PermissionFlagsBits, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require("discord.js");
const { getGuildConfig, updateGuildConfig } = require("../../guildConfig");
const { FEATURES, featureState } = require("../../features");
const { missingChannelPermissions, SEND_EMBED_PERMISSIONS } = require("../../channelChecks");
const { PLACEHOLDERS, buildGreetingEmbed } = require("../../greetings");
const {
    sectionView, channelPicker, buttonRow, button, channelText, pickedChannel, CHANNEL_GONE, savedChannel,
    STATE_TEXT, pauseButton, disableButton, featureStatus, togglePause,
} = require("../ui");

// Welcome and goodbye work the same way and only differ in their settings keys and wording
function greetingSection({ id, label, emoji, joining, defaultMessage, defaultTitle }) {
    const { channelKey, offKey } = FEATURES[id];
    const messageKey = `${id}Message`;
    const titleKey = `${id}Title`;

    const section = {
        id,
        label,
        emoji,
        permission: PermissionFlagsBits.ManageGuild,

        status: config => featureStatus(config, id),

        view(interaction, notice) {
            const config = getGuildConfig(interaction.guild.id);
            const state = featureState(config, id);
            const description = [
                `**Status:** ${STATE_TEXT[state]}`,
                `**Channel:** ${channelText(config[channelKey])}`,
                `**Title:** ${config[titleKey] || `*default:* ${defaultTitle}`}`,
                `**Message:** ${config[messageKey] || `*default:* ${defaultMessage}`}`,
                "",
                `Placeholders: ${PLACEHOLDERS}`,
            ].join("\n");
            return sectionView(section, description, [
                channelPicker(`setup:${id}:channel`, savedChannel(interaction.guild, config[channelKey]), { placeholder: `Pick the ${id} channel…` }),
                new ActionRowBuilder().addComponents(
                    button(`setup:${id}:text`, "✏️ Edit text"),
                    button(`setup:${id}:preview`, "👁️ Preview"),
                    pauseButton(`setup:${id}:pause`, state),
                    disableButton(`setup:${id}:disable`, state !== "off"),
                ),
                buttonRow(),
            ], notice);
        },

        async handleComponent(interaction, action) {
            const { guild } = interaction;
            const config = getGuildConfig(guild.id);

            if (action === "channel") {
                const channel = pickedChannel(interaction);
                const error = channel ? missingChannelPermissions(channel, guild.members.me, SEND_EMBED_PERMISSIONS) : CHANNEL_GONE;
                if (!error) updateGuildConfig(guild.id, { [channelKey]: channel.id });
                const pausedNote = config[offKey] ? " They're paused; press ▶️ Resume to turn them back on." : "";
                return interaction.update(section.view(interaction, error ?? `✅ ${label} messages will be sent in ${channel}.${pausedNote}`));
            }
            if (action === "text") {
                const title = new TextInputBuilder()
                    .setCustomId("title").setLabel("Title (leave empty for the default)").setStyle(TextInputStyle.Short)
                    .setMaxLength(256).setRequired(false).setPlaceholder(defaultTitle.slice(0, 100));
                const message = new TextInputBuilder()
                    .setCustomId("message").setLabel("Message (leave empty for the default)").setStyle(TextInputStyle.Paragraph)
                    .setMaxLength(1000).setRequired(false).setPlaceholder(defaultMessage.slice(0, 100));
                if (config[titleKey]) title.setValue(config[titleKey]);
                if (config[messageKey]) message.setValue(config[messageKey]);
                return interaction.showModal(new ModalBuilder()
                    .setCustomId(`setup:${id}:text`)
                    .setTitle(`${label} text`)
                    .addComponents(new ActionRowBuilder().addComponents(title), new ActionRowBuilder().addComponents(message)));
            }
            if (action === "preview") {
                // Shown with the person clicking standing in for the member
                return interaction.reply({
                    embeds: [buildGreetingEmbed(interaction.member, config[messageKey] || defaultMessage, joining, config[titleKey])],
                    flags: MessageFlags.Ephemeral,
                });
            }
            if (action === "pause") {
                const result = togglePause(guild.id, id);
                const notice = {
                    paused: `⏸️ ${label} messages paused. Your settings are kept.`,
                    resumed: `▶️ ${label} messages resumed.`,
                }[result] ?? "❌ Pick a channel first.";
                return interaction.update(section.view(interaction, notice));
            }
            if (action === "disable") {
                updateGuildConfig(guild.id, { [channelKey]: null, [messageKey]: null, [titleKey]: null, [offKey]: null });
                return interaction.update(section.view(interaction, `✅ ${label} messages disabled.`));
            }
        },

        async handleModal(interaction, action) {
            if (action !== "text") return;
            const title = interaction.fields.getTextInputValue("title").trim() || null;
            const message = interaction.fields.getTextInputValue("message").trim() || null;
            const updated = updateGuildConfig(interaction.guild.id, { [titleKey]: title, [messageKey]: message });
            const notice = updated[channelKey] ? "✅ Text saved." : "✅ Text saved. Pick a channel to turn it on.";
            return interaction.update(section.view(interaction, notice));
        },
    };
    return section;
}

module.exports = { greetingSection };
```

`lib/setup/sections/welcome.js`:

```js
const { DEFAULT_WELCOME, DEFAULT_WELCOME_TITLE } = require("../../greetings");
const { greetingSection } = require("./greeting");

module.exports = greetingSection({
    id: "welcome", label: "Welcome", emoji: "📢", joining: true, defaultMessage: DEFAULT_WELCOME, defaultTitle: DEFAULT_WELCOME_TITLE,
});
```

`lib/setup/sections/goodbye.js`:

```js
const { DEFAULT_GOODBYE, DEFAULT_GOODBYE_TITLE } = require("../../greetings");
const { greetingSection } = require("./greeting");

module.exports = greetingSection({
    id: "goodbye", label: "Goodbye", emoji: "👋", joining: false, defaultMessage: DEFAULT_GOODBYE, defaultTitle: DEFAULT_GOODBYE_TITLE,
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test`
Expected: PASS, 0 fail.

- [ ] **Step 7: Commit**

```bash
git add lib/setup lib/greetings.js events/memberJoin.js events/memberLeave.js commands/welcome.js commands/goodbye.js test/setupGreeting.test.js
git commit -m "Add pause, editable title and text to welcome and goodbye"
```

---

### Task 3: Logs section: pause and log types

**Files:**
- Modify: `lib/setup/sections/logs.js`
- Test: create `test/setupLogs.test.js`

**Interfaces:**
- Consumes: `LOG_TYPES` (Task 1) and the ui helpers (Task 2).
- Produces: custom IDs `setup:logs:channel|type:<id>|pause|disable`.

- [ ] **Step 1: Write the failing tests**

`test/setupLogs.test.js`:

```js
const { test, expect } = require("bun:test");
const setup = require("../commands/setup");
const { getGuildConfig, updateGuildConfig } = require("../lib/guildConfig");
const { fakeInteraction } = require("./fakes");

const update = interaction => interaction.update.mock.calls[0][0];
const rows = payload => payload.components.map(row => row.toJSON().components);

test("the view has a toggle for each log type", () => {
    const logs = require("../lib/setup/sections/logs");
    const ids = rows(logs.view(fakeInteraction()))[1].map(c => c.custom_id);
    expect(ids).toEqual(["messages", "members", "moderation", "server", "voice"].map(t => `setup:logs:type:${t}`));
});

test("a type toggle switches that type off and on", async () => {
    const off = fakeInteraction({ customId: "setup:logs:type:voice" });
    await setup.handleComponent(off);
    expect(getGuildConfig(off.guild.id).logTypesOff).toEqual(["voice"]);
    expect(update(off).content).toBe("🔊 Voice logs: ❌ off");

    const on = fakeInteraction({ guild: off.guild, customId: "setup:logs:type:voice" });
    await setup.handleComponent(on);
    expect(getGuildConfig(off.guild.id).logTypesOff).toBeUndefined();
});

test("an unknown type is out of date", async () => {
    const interaction = fakeInteraction({ customId: "setup:logs:type:nope" });
    await setup.handleComponent(interaction);
    expect(interaction.reply.mock.calls[0][0].content).toBe("⚠️ This dashboard is out of date. Run /setup again.");
});

test("Pause keeps the channel", async () => {
    const interaction = fakeInteraction({ customId: "setup:logs:pause" });
    updateGuildConfig(interaction.guild.id, { logChannelId: "c1" });
    await setup.handleComponent(interaction);
    expect(getGuildConfig(interaction.guild.id)).toMatchObject({ logChannelId: "c1", logsOff: true });
    expect(update(interaction).content).toBe("⏸️ Logging paused. Your settings are kept.");
});

test("Disable clears channel, pause and types", async () => {
    const interaction = fakeInteraction({ customId: "setup:logs:disable" });
    updateGuildConfig(interaction.guild.id, { logChannelId: "c1", logsOff: true, logTypesOff: ["voice"] });
    await setup.handleComponent(interaction);
    expect(getGuildConfig(interaction.guild.id)).toEqual({});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/setupLogs.test.js`
Expected: FAIL on the type toggles, pause and Disable tests.

- [ ] **Step 3: Rewrite `lib/setup/sections/logs.js`**

```js
const { PermissionFlagsBits, ChannelType, ActionRowBuilder } = require("discord.js");
const { getGuildConfig, updateGuildConfig } = require("../../guildConfig");
const { featureState } = require("../../features");
const { LOG_TYPES } = require("../../logger");
const { missingChannelPermissions, SEND_EMBED_PERMISSIONS } = require("../../channelChecks");
const {
    sectionView, channelPicker, buttonRow, toggleButton, channelText, pickedChannel, CHANNEL_GONE, savedChannel,
    STATE_TEXT, pauseButton, disableButton, featureStatus, togglePause,
} = require("../ui");

const section = {
    id: "logs",
    label: "Logs",
    emoji: "📜",
    permission: PermissionFlagsBits.ManageGuild,

    status: config => featureStatus(config, "logs"),

    view(interaction, notice) {
        const config = getGuildConfig(interaction.guild.id);
        const state = featureState(config, "logs");
        const typesOff = config.logTypesOff ?? [];
        const lines = [
            "Logs server activity to a channel. Switch off the kinds you don't want.",
            "",
            `**Status:** ${STATE_TEXT[state]}`,
            `**Channel:** ${channelText(config.logChannelId)}`,
            `**Logged:** ${LOG_TYPES.map(t => `${t.emoji} ${t.label} ${typesOff.includes(t.id) ? "❌" : "✅"}`).join(" · ")}`,
        ];
        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
            lines.push("", "⚠️ Give me **View Audit Log** so logs can show who banned/kicked/timed out someone.");
        }
        return sectionView(section, lines.join("\n"), [
            channelPicker("setup:logs:channel", savedChannel(interaction.guild, config.logChannelId), {
                placeholder: "Pick the log channel…", types: [ChannelType.GuildText],
            }),
            new ActionRowBuilder().addComponents(LOG_TYPES.map(t =>
                toggleButton(`setup:logs:type:${t.id}`, `${t.emoji} ${t.label}`, !typesOff.includes(t.id)))),
            buttonRow(pauseButton("setup:logs:pause", state), disableButton("setup:logs:disable", state !== "off")),
        ], notice);
    },

    async handleComponent(interaction, action, arg) {
        const { guild } = interaction;
        const config = getGuildConfig(guild.id);

        if (action === "channel") {
            const channel = pickedChannel(interaction);
            const error = channel ? missingChannelPermissions(channel, guild.members.me, SEND_EMBED_PERMISSIONS) : CHANNEL_GONE;
            if (!error) updateGuildConfig(guild.id, { logChannelId: channel.id });
            const pausedNote = config.logsOff ? " Logging is paused; press ▶️ Resume to turn it back on." : "";
            return interaction.update(section.view(interaction, error ?? `✅ Logs will be sent to ${channel}.${pausedNote}`));
        }
        if (action === "type") {
            const type = LOG_TYPES.find(t => t.id === arg);
            if (!type) return;
            const typesOff = config.logTypesOff ?? [];
            const turningOff = !typesOff.includes(type.id);
            const next = turningOff ? [...typesOff, type.id] : typesOff.filter(id => id !== type.id);
            updateGuildConfig(guild.id, { logTypesOff: next.length ? next : null });
            return interaction.update(section.view(interaction, `${type.emoji} ${type.label} logs: ${turningOff ? "❌ off" : "✅ on"}`));
        }
        if (action === "pause") {
            const result = togglePause(guild.id, "logs");
            const notice = { paused: "⏸️ Logging paused. Your settings are kept.", resumed: "▶️ Logging resumed." }[result]
                ?? "❌ Pick a channel first.";
            return interaction.update(section.view(interaction, notice));
        }
        if (action === "disable") {
            updateGuildConfig(guild.id, { logChannelId: null, logsOff: null, logTypesOff: null });
            return interaction.update(section.view(interaction, "✅ Logging disabled."));
        }
    },
};

module.exports = section;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test`
Expected: PASS, 0 fail. The existing logs tests in `test/setup.test.js` still pass.

- [ ] **Step 5: Commit**

```bash
git add lib/setup/sections/logs.js test/setupLogs.test.js
git commit -m "Add pause and per-type toggles to the logs section"
```

---

### Task 4: Honeypot: pause, warning text, preview

**Files:**
- Modify: `lib/honeypot.js`, `commands/honeypot.js`, `lib/setup/sections/honeypot.js`
- Test: modify `test/setupHoneypotAutomod.test.js` and `test/honeypot.test.js`

**Interfaces:**
- Consumes: the ui helpers (Task 2).
- Produces:
  - `honeypotWarningEmbed(action, { title, text } = {})` and `savedWarning(config, action)` from `lib/honeypot.js`.
  - Custom IDs `setup:honeypot:channel|action|text|preview|warning|pause|disable`, and the modal `setup:honeypot:text`.

- [ ] **Step 1: Write the failing tests**

Add to `test/honeypot.test.js`:

```js
test("the warning uses custom text with {action}", () => {
    const json = honeypotWarningEmbed("kick", { title: "Stop!", text: "You will be {action}." }).toJSON();
    expect(json.title).toBe("Stop!");
    expect(json.description).toBe("You will be kicked.");
});
```

Add to the `describe("honeypot section", ...)` block in `test/setupHoneypotAutomod.test.js` (it already imports `getGuildConfig`, `updateGuildConfig`, `fakeGuild`, `fakeChannel`, `fakeInteraction` and `setup`):

```js
    test("Warning text saves and Post warning uses it", async () => {
        const channel = fakeChannel();
        const guild = fakeGuild({ channels: [channel] });
        updateGuildConfig(guild.id, { honeypotChannelId: channel.id, honeypotAction: "kick" });
        const save = fakeInteraction({ guild, customId: "setup:honeypot:text", fields: { title: "Stop!", text: "You get {action}." } });
        await setup.handleModal(save);
        expect(getGuildConfig(guild.id)).toMatchObject({ honeypotWarningTitle: "Stop!", honeypotWarningText: "You get {action}." });
        expect(update(save).content).toBe("✅ Warning text saved. Use 📤 Post warning to update the notice in the channel.");

        const post = fakeInteraction({ guild, customId: "setup:honeypot:warning" });
        await setup.handleComponent(post);
        expect(channel.send.mock.calls[0][0].embeds[0].toJSON()).toMatchObject({ title: "Stop!", description: "You get kicked." });
    });

    test("Preview warning replies privately without posting", async () => {
        const channel = fakeChannel();
        const guild = fakeGuild({ channels: [channel] });
        updateGuildConfig(guild.id, { honeypotChannelId: channel.id });
        const interaction = fakeInteraction({ guild, customId: "setup:honeypot:preview" });
        await setup.handleComponent(interaction);
        expect(interaction.reply.mock.calls[0][0].embeds[0].toJSON().title).toBe("⚠️ DO NOT SEND MESSAGES IN THIS CHANNEL");
        expect(channel.send).not.toHaveBeenCalled();
    });

    test("Pause keeps the channel and action", async () => {
        const interaction = fakeInteraction({ customId: "setup:honeypot:pause" });
        updateGuildConfig(interaction.guild.id, { honeypotChannelId: "c1", honeypotAction: "kick" });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(interaction.guild.id)).toMatchObject({ honeypotChannelId: "c1", honeypotAction: "kick", honeypotOff: true });
        expect(update(interaction).content).toBe("⏸️ Honeypot paused. Your settings are kept.");
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/honeypot.test.js test/setupHoneypotAutomod.test.js`
Expected: FAIL on the 4 new tests.

- [ ] **Step 3: Custom warning text in `lib/honeypot.js`**

- Replace the `honeypotWarningEmbed` function with:

```js
const DEFAULT_WARNING_TITLE = "⚠️ DO NOT SEND MESSAGES IN THIS CHANNEL";
const DEFAULT_WARNING_TEXT = "This channel is a trap for hacked accounts and spam bots.\n\nAnyone who posts here is **automatically {action}**.";

// The "do not type here" notice posted in the trap channel; {action} becomes what happens to posters
function honeypotWarningEmbed(action, { title, text } = {}) {
    return new EmbedBuilder()
        .setColor(COLORS.danger)
        .setTitle(title || DEFAULT_WARNING_TITLE)
        .setDescription((text || DEFAULT_WARNING_TEXT).replaceAll("{action}", ACTION_RESULTS[action] ?? ACTION_RESULTS.softban));
}

// The warning with this server's saved title and text
const savedWarning = (config, action) =>
    honeypotWarningEmbed(action, { title: config.honeypotWarningTitle, text: config.honeypotWarningText });
```

- Change the export to `module.exports = { ACTION_LABELS, DEFAULT_WARNING_TITLE, honeypotError, honeypotWarningEmbed, savedWarning };`.
- In `commands/honeypot.js`:
  - Change the import to `const { ACTION_LABELS, honeypotError, savedWarning } = require('../lib/honeypot');`.
  - Change the post line to `if (postWarning) await channel.send({ embeds: [savedWarning(getGuildConfig(interaction.guild.id), action)] }).catch(() => {});`.

- [ ] **Step 4: Rewrite `lib/setup/sections/honeypot.js`**

```js
const {
    PermissionFlagsBits, ButtonStyle, ChannelType, ActionRowBuilder, StringSelectMenuBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require("discord.js");
const { getGuildConfig, updateGuildConfig } = require("../../guildConfig");
const { featureState } = require("../../features");
const { ACTION_LABELS, DEFAULT_WARNING_TITLE, honeypotError, savedWarning } = require("../../honeypot");
const {
    sectionView, channelPicker, buttonRow, button, channelText, pickedChannel, CHANNEL_GONE, savedChannel,
    STATE_TEXT, pauseButton, disableButton, featureStatus, togglePause,
} = require("../ui");

const section = {
    id: "honeypot",
    label: "Honeypot",
    emoji: "🍯",
    permission: PermissionFlagsBits.Administrator,

    status: config => featureStatus(config, "honeypot"),

    view(interaction, notice) {
        const config = getGuildConfig(interaction.guild.id);
        const state = featureState(config, "honeypot");
        const action = config.honeypotAction || "softban";
        const description = [
            "A trap channel: anyone who posts in it is removed. Staff with **Manage Messages** are ignored.",
            "💡 Put it near the top of the channel list; spam bots usually post in the first channels they see.",
            "",
            `**Status:** ${STATE_TEXT[state]}`,
            `**Channel:** ${channelText(config.honeypotChannelId)}`,
            `**Action:** ${ACTION_LABELS[action]}`,
            `**Warning:** ${config.honeypotWarningTitle || config.honeypotWarningText ? "custom text" : "default text"}`,
        ].join("\n");
        const actionMenu = new StringSelectMenuBuilder()
            .setCustomId("setup:honeypot:action")
            .addOptions(Object.entries(ACTION_LABELS).map(([value, label]) => ({ label, value, default: value === action })));
        return sectionView(section, description, [
            channelPicker("setup:honeypot:channel", savedChannel(interaction.guild, config.honeypotChannelId), {
                placeholder: "Pick the trap channel…", types: [ChannelType.GuildText],
            }),
            new ActionRowBuilder().addComponents(actionMenu),
            new ActionRowBuilder().addComponents(
                button("setup:honeypot:text", "✏️ Warning text"),
                button("setup:honeypot:preview", "👁️ Preview warning"),
                button("setup:honeypot:warning", "📤 Post warning", ButtonStyle.Primary).setDisabled(!config.honeypotChannelId),
            ),
            buttonRow(pauseButton("setup:honeypot:pause", state), disableButton("setup:honeypot:disable", state !== "off")),
        ], notice);
    },

    async handleComponent(interaction, action) {
        const { guild } = interaction;
        const config = getGuildConfig(guild.id);
        const current = config.honeypotAction || "softban";

        if (action === "channel") {
            const channel = pickedChannel(interaction);
            const error = channel ? honeypotError(guild, channel, current) : CHANNEL_GONE;
            if (!error) updateGuildConfig(guild.id, { honeypotChannelId: channel.id, honeypotAction: current });
            return interaction.update(section.view(interaction,
                error ?? `🍯 Honeypot set to ${channel}. Use **📤 Post warning** so members know not to type there.`));
        }
        if (action === "action") {
            const chosen = interaction.values[0];
            const channel = config.honeypotChannelId && guild.channels.cache.get(config.honeypotChannelId);
            const error = channel ? honeypotError(guild, channel, chosen) : null;
            if (!error) updateGuildConfig(guild.id, { honeypotAction: chosen });
            return interaction.update(section.view(interaction,
                error ?? `✅ Action: **${ACTION_LABELS[chosen]}**. Re-post the warning if it mentions the action.`));
        }
        if (action === "text") {
            const title = new TextInputBuilder()
                .setCustomId("title").setLabel("Title (leave empty for the default)").setStyle(TextInputStyle.Short)
                .setMaxLength(256).setRequired(false).setPlaceholder(DEFAULT_WARNING_TITLE);
            const text = new TextInputBuilder()
                .setCustomId("text").setLabel("Text ({action} = what happens to posters)").setStyle(TextInputStyle.Paragraph)
                .setMaxLength(2000).setRequired(false);
            if (config.honeypotWarningTitle) title.setValue(config.honeypotWarningTitle);
            if (config.honeypotWarningText) text.setValue(config.honeypotWarningText);
            return interaction.showModal(new ModalBuilder()
                .setCustomId("setup:honeypot:text")
                .setTitle("Honeypot warning")
                .addComponents(new ActionRowBuilder().addComponents(title), new ActionRowBuilder().addComponents(text)));
        }
        if (action === "preview") {
            return interaction.reply({ embeds: [savedWarning(config, current)], flags: MessageFlags.Ephemeral });
        }
        if (action === "warning") {
            const channel = guild.channels.cache.get(config.honeypotChannelId);
            const sent = channel && await channel.send({ embeds: [savedWarning(config, current)] }).then(() => true, () => false);
            return interaction.update(section.view(interaction,
                sent ? `✅ Warning posted in ${channel}.` : "❌ I couldn't post in the honeypot channel."));
        }
        if (action === "pause") {
            const result = togglePause(guild.id, "honeypot");
            const notice = { paused: "⏸️ Honeypot paused. Your settings are kept.", resumed: "▶️ Honeypot resumed." }[result]
                ?? "❌ Pick a channel first.";
            return interaction.update(section.view(interaction, notice));
        }
        if (action === "disable") {
            updateGuildConfig(guild.id, {
                honeypotChannelId: null, honeypotAction: null, honeypotOff: null, honeypotWarningTitle: null, honeypotWarningText: null,
            });
            return interaction.update(section.view(interaction, "✅ Honeypot disabled."));
        }
    },

    async handleModal(interaction, action) {
        if (action !== "text") return;
        updateGuildConfig(interaction.guild.id, {
            honeypotWarningTitle: interaction.fields.getTextInputValue("title").trim() || null,
            honeypotWarningText: interaction.fields.getTextInputValue("text").trim() || null,
        });
        return interaction.update(section.view(interaction,
            "✅ Warning text saved. Use 📤 Post warning to update the notice in the channel."));
    },
};

module.exports = section;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test`
Expected: PASS, 0 fail. The existing honeypot tests still pass, because the channel notice only changed wording that they don't assert.

- [ ] **Step 6: Commit**

```bash
git add lib/honeypot.js commands/honeypot.js lib/setup/sections/honeypot.js test/honeypot.test.js test/setupHoneypotAutomod.test.js
git commit -m "Add pause, warning text and preview to the honeypot section"
```

---

### Task 5: FAQ panel text and preview; auto role button names

**Files:**
- Modify: `lib/faq.js`, `commands/faqmanage.js`, `lib/setup/sections/faq.js`, `lib/setup/sections/autorole.js`
- Test: modify `test/faqHelpers.test.js`, `test/setupFaqSelfRoles.test.js`, `test/setupRoles.test.js`

**Interfaces:**
- Produces:
  - `faqPanel(faqs, { title, text } = {})` and `savedFaqPanel(guildId, faqs)` from `lib/faq.js`.
  - FAQ custom IDs gain `setup:faq:paneltext` (button and modal) and `setup:faq:previewpanel`.

- [ ] **Step 1: Write the failing tests**

Add to `test/faqHelpers.test.js`:

```js
test("the panel uses custom title and text", () => {
    const json = faqPanel([{ id: 1, question: "Q?" }], { title: "Help", text: "Choose one:" }).embeds[0].toJSON();
    expect(json.title).toBe("Help");
    expect(json.description).toBe("Choose one:\n\n• Q?");
});
```

In `test/setupFaqSelfRoles.test.js`:

- Change the line `const [, edit, remove] = lastRow(update(interaction));` to `const [, edit, remove] = update(interaction).components.at(-2).toJSON().components;`.
- Add inside `describe("FAQ section", ...)`:

```js
    test("Panel text saves and Preview panel uses it", async () => {
        const guild = fakeGuild();
        addFaq(guild.id, "How?", "Like this.");
        const save = fakeInteraction({ guild, customId: "setup:faq:paneltext", fields: { title: "Help", text: "Pick:" } });
        await setup.handleModal(save);
        expect(update(save).content).toBe("✅ Panel text saved.");

        const preview = fakeInteraction({ guild, customId: "setup:faq:previewpanel" });
        await setup.handleComponent(preview);
        const reply = preview.reply.mock.calls[0][0];
        expect(reply.embeds[0].toJSON()).toMatchObject({ title: "Help", description: "Pick:\n\n• How?" });
    });
```

In `test/setupRoles.test.js`, add inside `describe("auto role section", ...)`:

```js
    test("its clear buttons are named Disable for members/bots", () => {
        const autorole = require("../lib/setup/sections/autorole");
        const labels = autorole.view(fakeInteraction()).components.at(-1).toJSON().components.map(c => c.label);
        expect(labels).toEqual(["Disable for members", "Disable for bots", "◀ Home"]);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/faqHelpers.test.js test/setupFaqSelfRoles.test.js test/setupRoles.test.js`
Expected: FAIL on the 3 new tests and the changed `at(-2)` test.

- [ ] **Step 3: Implement**

In `lib/faq.js`:

- Add `const { getGuildConfig } = require("./guildConfig");` after the jsonFile import.
- Replace `faqPanel` with:

```js
const DEFAULT_PANEL_TITLE = "❓ Frequently Asked Questions";
const DEFAULT_PANEL_TEXT = "Pick a question from the menu below to see the answer.";

// The public FAQ panel; its menu ("faq:select") is handled by commands/faq.js
function faqPanel(faqs, { title, text } = {}) {
    const shown = faqs.slice(0, 25);
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(title || DEFAULT_PANEL_TITLE)
        .setDescription(`${text || DEFAULT_PANEL_TEXT}\n\n${shown.map(f => `• ${f.question}`).join("\n")}`);
    const menu = new StringSelectMenuBuilder()
        .setCustomId("faq:select")
        .setPlaceholder("Choose a question…")
        .addOptions(shown.map(f => ({ label: f.question.slice(0, 100), value: String(f.id) })));
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

// The panel with this server's saved title and text
function savedFaqPanel(guildId, faqs) {
    const config = getGuildConfig(guildId);
    return faqPanel(faqs, { title: config.faqPanelTitle, text: config.faqPanelText });
}
```

- Export `savedFaqPanel` and `DEFAULT_PANEL_TITLE` too.

In `commands/faqmanage.js`, change `faqPanel` in the import to `savedFaqPanel`, and change `await channel.send(faqPanel(faqs));` to `await channel.send(savedFaqPanel(guildId, faqs));`.

In `lib/setup/sections/faq.js`:

- Imports:
  - Change the faq import to `const { getFaqs, findFaq, removeFaq, faqModal, savedFaqPanel, DEFAULT_PANEL_TITLE } = require("../../faq");`.
  - Change the discord.js import to `const { PermissionFlagsBits, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require("discord.js");`.
  - Add `const { getGuildConfig, updateGuildConfig } = require("../../guildConfig");`.
- Replace the final `buttonRow(...)` inside `components.push(...)` with these two rows:

```js
            new ActionRowBuilder().addComponents(
                button("setup:faq:add", "➕ Add", ButtonStyle.Success),
                button(`setup:faq:edit:${selected?.id ?? 0}`, "✏️ Edit").setDisabled(!selected),
                button(`setup:faq:remove:${selected?.id ?? 0}`, "🗑️ Remove", ButtonStyle.Danger).setDisabled(!selected),
            ),
            buttonRow(
                button("setup:faq:paneltext", "✏️ Panel text"),
                button("setup:faq:previewpanel", "👁️ Preview panel").setDisabled(!faqs.length),
            ),
```

- In `handleComponent`, change `channel.send(faqPanel(faqs))` to `channel.send(savedFaqPanel(guild.id, faqs))`. Then add before the closing brace:

```js
        if (action === "paneltext") {
            const config = getGuildConfig(guild.id);
            const title = new TextInputBuilder()
                .setCustomId("title").setLabel("Title (leave empty for the default)").setStyle(TextInputStyle.Short)
                .setMaxLength(256).setRequired(false).setPlaceholder(DEFAULT_PANEL_TITLE);
            const text = new TextInputBuilder()
                .setCustomId("text").setLabel("Text above the questions (empty = default)").setStyle(TextInputStyle.Paragraph)
                .setMaxLength(2000).setRequired(false);
            if (config.faqPanelTitle) title.setValue(config.faqPanelTitle);
            if (config.faqPanelText) text.setValue(config.faqPanelText);
            return interaction.showModal(new ModalBuilder()
                .setCustomId("setup:faq:paneltext")
                .setTitle("FAQ panel text")
                .addComponents(new ActionRowBuilder().addComponents(title), new ActionRowBuilder().addComponents(text)));
        }
        if (action === "previewpanel") {
            const faqs = getFaqs(guild.id);
            if (!faqs.length) return interaction.update(section.view(interaction, "❌ Add some questions first."));
            return interaction.reply({ ...savedFaqPanel(guild.id, faqs), flags: MessageFlags.Ephemeral });
        }
```

- Add this method to the section:

```js
    async handleModal(interaction, action) {
        if (action !== "paneltext") return;
        updateGuildConfig(interaction.guild.id, {
            faqPanelTitle: interaction.fields.getTextInputValue("title").trim() || null,
            faqPanelText: interaction.fields.getTextInputValue("text").trim() || null,
        });
        return interaction.update(section.view(interaction, "✅ Panel text saved."));
    },
```

In `lib/setup/sections/autorole.js`, change the labels `"Clear members"` → `"Disable for members"` and `"Clear bots"` → `"Disable for bots"`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test`
Expected: PASS, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add lib/faq.js commands/faqmanage.js lib/setup/sections/faq.js lib/setup/sections/autorole.js test/faqHelpers.test.js test/setupFaqSelfRoles.test.js test/setupRoles.test.js
git commit -m "Add FAQ panel text and preview; name auto role buttons consistently"
```

---

### Task 6: Self-role panel store

**Files:**
- Create: `lib/selfRolePanels.js`, `test/selfRolePanels.test.js`
- Modify: `lib/selfRoles.js`, `commands/selfroles.js`, `test/selfRoles.test.js`

**Interfaces:**
- Produces:
  - `lib/selfRoles.js`: `MAX_SELF_ROLES = 25` and `DEFAULT_SELF_ROLE_TEXT`.
  - `lib/selfRolePanels.js`:
    - `getPanels(guildId)`
    - `findPanel(guildId, messageId)`
    - `savePanel(guildId, panel)`
    - `removePanel(guildId, messageId)`
    - `parseMessageLink(text)` → `{ guildId, channelId, messageId } | null`
    - `readPanelMessage(message, botId)` → panel or null
  - A panel is `{ messageId, channelId, title, description: string|null, roleIds: string[] }`.

- [ ] **Step 1: Write the failing tests**

`test/selfRolePanels.test.js`:

```js
const { test, expect } = require("bun:test");
const { getPanels, findPanel, savePanel, removePanel, parseMessageLink, readPanelMessage } = require("../lib/selfRolePanels");
const { buildSelfRolePanel } = require("../lib/selfRoles");
const { fakeGuild, fakeRole } = require("./fakes");

test("panels are saved, replaced by message id, and removed", () => {
    const { id } = fakeGuild();
    savePanel(id, { messageId: "m1", channelId: "c1", title: "A", description: null, roleIds: ["r1"] });
    savePanel(id, { messageId: "m1", channelId: "c1", title: "B", description: null, roleIds: ["r1", "r2"] });
    expect(getPanels(id)).toHaveLength(1);
    expect(findPanel(id, "m1").title).toBe("B");
    removePanel(id, "m1");
    expect(getPanels(id)).toEqual([]);
});

test("message links are parsed, including ptb and canary", () => {
    expect(parseMessageLink("https://discord.com/channels/1/2/3")).toEqual({ guildId: "1", channelId: "2", messageId: "3" });
    expect(parseMessageLink(" https://canary.discord.com/channels/1/2/3 ")).toEqual({ guildId: "1", channelId: "2", messageId: "3" });
    expect(parseMessageLink("https://ptb.discordapp.com/channels/1/2/3")).toEqual({ guildId: "1", channelId: "2", messageId: "3" });
    expect(parseMessageLink("https://example.com/channels/1/2/3")).toBeNull();
    expect(parseMessageLink("hello")).toBeNull();
});

// A posted panel as discord.js returns it: embeds with title/description, rows of buttons with customId
function postedMessage(payload, authorId = "bot") {
    const embed = payload.embeds[0].toJSON();
    return {
        id: "m9",
        channelId: "c9",
        author: { id: authorId },
        embeds: [{ title: embed.title, description: embed.description }],
        components: payload.components.map(row => ({ components: row.toJSON().components.map(c => ({ customId: c.custom_id })) })),
    };
}

test("an existing panel is read back from its message", () => {
    const roles = [fakeRole("r1"), fakeRole("r2")];
    const message = postedMessage(buildSelfRolePanel("Colors", "Pick a color", roles));
    expect(readPanelMessage(message, "bot")).toEqual({
        messageId: "m9", channelId: "c9", title: "Colors", description: "Pick a color", roleIds: ["r1", "r2"],
    });
});

test("the default description is read back as null", () => {
    const message = postedMessage(buildSelfRolePanel("Colors", null, [fakeRole("r1")]));
    expect(readPanelMessage(message, "bot").description).toBeNull();
});

test("messages from others or without role buttons are not panels", () => {
    const panel = buildSelfRolePanel("Colors", null, [fakeRole("r1")]);
    expect(readPanelMessage(postedMessage(panel, "someone"), "bot")).toBeNull();
    expect(readPanelMessage({ ...postedMessage(panel), components: [] }, "bot")).toBeNull();
});
```

In `test/selfRoles.test.js`, change the first test to:

```js
test("allows up to 25 roles", () => {
    expect(MAX_SELF_ROLES).toBe(25);
});
```

and add:

```js
test("25 roles fit in five rows of five buttons", () => {
    const roles = Array.from({ length: 25 }, (_, i) => fakeRole(`r${i}`));
    expect(buildSelfRolePanel("Pick roles", null, roles).components).toHaveLength(5);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/selfRolePanels.test.js test/selfRoles.test.js`
Expected: FAIL with `Cannot find module '../lib/selfRolePanels'`, and `MAX_SELF_ROLES` is 10.

- [ ] **Step 3: Implement**

In `lib/selfRoles.js`:

- Change the limit to:

```js
// Five rows of five buttons
const MAX_SELF_ROLES = 25;
const DEFAULT_SELF_ROLE_TEXT = "Click a button to get or remove a role.";
```

- Replace `"Click a button to get or remove a role."` inside `buildSelfRolePanel` with `DEFAULT_SELF_ROLE_TEXT`.
- Export `DEFAULT_SELF_ROLE_TEXT`.

`lib/selfRolePanels.js`:

```js
const { loadJsonFile } = require("./jsonFile");
const { DEFAULT_SELF_ROLE_TEXT } = require("./selfRoles");

// { [guildId]: [{ messageId, channelId, title, description, roleIds }] }
const store = loadJsonFile("self-role-panels");

const getPanels = guildId => store.data[guildId] || [];
const findPanel = (guildId, messageId) => getPanels(guildId).find(p => p.messageId === messageId) || null;

// Inserts a panel, or replaces the one with the same message id
function savePanel(guildId, panel) {
    const list = (store.data[guildId] ??= []);
    const index = list.findIndex(p => p.messageId === panel.messageId);
    if (index === -1) list.push(panel);
    else list[index] = panel;
    store.save();
}

function removePanel(guildId, messageId) {
    store.data[guildId] = getPanels(guildId).filter(p => p.messageId !== messageId);
    store.save();
}

const LINK_REGEX = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)\/?$/;

// "https://discord.com/channels/<guild>/<channel>/<message>" -> ids, or null
function parseMessageLink(text) {
    const match = text.trim().match(LINK_REGEX);
    return match ? { guildId: match[1], channelId: match[2], messageId: match[3] } : null;
}

// Reads a self-role panel the bot posted earlier, or null if the message isn't one
function readPanelMessage(message, botId) {
    if (message.author?.id !== botId) return null;
    const roleIds = message.components
        .flatMap(row => row.components)
        .map(component => component.customId)
        .filter(id => id?.startsWith("selfrole:"))
        .map(id => id.slice("selfrole:".length));
    if (!roleIds.length) return null;

    const embed = message.embeds[0];
    const text = embed?.description ?? "";
    // The description ends with the "\n\n• <role>" list the bot adds
    const cut = text.lastIndexOf("\n\n• ");
    const description = (cut === -1 ? text : text.slice(0, cut)).trim();
    return {
        messageId: message.id,
        channelId: message.channelId,
        title: embed?.title || "Roles",
        description: description && description !== DEFAULT_SELF_ROLE_TEXT ? description : null,
        roleIds,
    };
}

module.exports = { getPanels, findPanel, savePanel, removePanel, parseMessageLink, readPanelMessage };
```

In `commands/selfroles.js`:

- Change the import to `const { buildSelfRolePanel } = require('../lib/selfRoles');` and add `const { savePanel } = require('../lib/selfRolePanels');`.
- Add after the requires:

```js
// Slash commands allow 25 options in total, so /selfroles keeps 10 role slots (the dashboard allows 25)
const SLASH_ROLE_OPTIONS = 10;
```

- Replace both uses of `MAX_SELF_ROLES` with `SLASH_ROLE_OPTIONS`.
- Replace `await interaction.channel.send(panel);` with:

```js
      const message = await interaction.channel.send(panel);
      savePanel(interaction.guild.id, {
        messageId: message.id,
        channelId: message.channelId,
        title: interaction.options.getString('title'),
        description: interaction.options.getString('description'),
        roleIds: roles.map(r => r.id),
      });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test && bun -e "require('./commands/selfroles').data.toJSON(); console.log('ok')"`
Expected: PASS, 0 fail, then `ok`.

- [ ] **Step 5: Commit**

```bash
git add lib/selfRoles.js lib/selfRolePanels.js commands/selfroles.js test/selfRolePanels.test.js test/selfRoles.test.js
git commit -m "Store self-role panels so they can be edited later"
```

---

### Task 7: Self-role panel manager in /setup

**Files:**
- Rewrite: `lib/setup/sections/selfroles.js`
- Create: `test/limits.js`, `test/setupSelfRoles.test.js`
- Modify: `test/setupViews.test.js`, `test/setupFaqSelfRoles.test.js`

**Interfaces:**
- Consumes:
  - the panel store (Task 6)
  - `buildSelfRolePanel`, `MAX_SELF_ROLES`
  - `saveDraft`, `getDraft`, `dropDraft`, `EXPIRED`
  - `checkAssignableRole`
  - `missingChannelPermissions`
  - the ui helpers
- Produces:
  - `test/limits.js` → `rowsOf(payload)` and `expectWithinDiscordLimits(payload)`.
  - Self-role custom IDs:

    | Where | Custom IDs |
    |---|---|
    | List | `setup:selfroles:list`, `open`, `new`, `adopt` (button and modal) |
    | New panel | `newchannel:<d>`, `newroles:<d>`, `newtext:<d>` (button and modal), `newpreview:<d>`, `post:<d>` |
    | Edit panel | `edit:<m>`, `roles:<m>`, `text:<m>` (button and modal), `preview:<m>`, `delete:<m>`, `confirmdelete:<m>` |

  - `section.view(interaction, notice?, mode?)`, where `mode` is `{ draftId }`, `{ messageId, confirmDelete? }`, or absent for the list.

- [ ] **Step 1: Share the limit helpers and cover panels in the generic view test**

Create `test/limits.js`:

```js
const { expect } = require("bun:test");

const rowsOf = payload => payload.components.map(row => row.toJSON());

// Discord rejects messages that break these limits with "interaction failed"
function expectWithinDiscordLimits(payload) {
    expect(payload.components.length).toBeLessThanOrEqual(5);
    for (const embed of payload.embeds) expect((embed.toJSON().description ?? "").length).toBeLessThanOrEqual(4096);
    for (const row of rowsOf(payload)) {
        expect(row.components.length).toBeLessThanOrEqual(5);
        for (const component of row.components) {
            expect(component.custom_id.length).toBeLessThanOrEqual(100);
            expect(component.custom_id).toMatch(/^(setup|faqmanage):/);
            if (component.options) {
                expect(component.options.length).toBeGreaterThan(0);
                expect(component.options.length).toBeLessThanOrEqual(25);
            }
            for (const option of component.options ?? []) expect(option.label.length).toBeLessThanOrEqual(100);
            if (component.label) expect(component.label.length).toBeLessThanOrEqual(80);
        }
    }
}

module.exports = { rowsOf, expectWithinDiscordLimits };
```

In `test/setupViews.test.js`:

- Delete the local `rowsOf` and `expectWithinDiscordLimits` definitions and add `const { rowsOf, expectWithinDiscordLimits } = require("./limits");`.
- Add `const { savePanel } = require("../lib/selfRolePanels");`.
- In `filledInteraction`, after the FAQ loop, add:

```js
    for (let i = 0; i < 30; i++) {
        savePanel(interaction.guild.id, {
            messageId: `m${i}`, channelId: "c1", title: `Panel ${i} ${"y".repeat(190)}`, description: null, roleIds: ["r1"],
        });
    }
```

In `test/setupFaqSelfRoles.test.js`, delete the whole `describe("self roles section", ...)` block and the now-unused `fakeRole` import.

- [ ] **Step 2: Write the failing tests**

`test/setupSelfRoles.test.js`:

```js
const { describe, test, expect, mock } = require("bun:test");
const { MessageFlags } = require("discord.js");
const setup = require("../commands/setup");
const selfroles = require("../lib/setup/sections/selfroles");
const { getPanels, findPanel, savePanel } = require("../lib/selfRolePanels");
const { buildSelfRolePanel } = require("../lib/selfRoles");
const { fakeGuild, fakeChannel, fakeRole, fakeInteraction } = require("./fakes");
const { rowsOf, expectWithinDiscordLimits } = require("./limits");

const update = interaction => interaction.update.mock.calls.at(-1)[0];
const customIds = payload => rowsOf(payload).flatMap(row => row.components.map(c => c.custom_id));

// A channel that can post, fetch, edit and delete messages like a real one
function panelChannel() {
    const channel = fakeChannel();
    const messages = new Map();
    channel.send = mock(async payload => {
        const message = { id: `msg${messages.size + 1}`, channelId: channel.id, edit: mock(async () => {}) };
        messages.set(message.id, message);
        return message;
    });
    channel.messages = {
        fetch: mock(async id => {
            if (!messages.has(id)) throw new Error("Unknown Message");
            return messages.get(id);
        }),
        delete: mock(async id => { messages.delete(id); }),
    };
    channel.stored = messages;
    return channel;
}

async function click(guild, customId, extra = {}) {
    const interaction = fakeInteraction({ guild, customId, ...extra });
    await setup.handleComponent(interaction);
    return interaction;
}

async function submit(guild, customId, fields) {
    const interaction = fakeInteraction({ guild, customId, fields });
    await setup.handleModal(interaction);
    return interaction;
}

describe("new panel", () => {
    test("channel, roles and text, then Post records the panel", async () => {
        const channel = panelChannel();
        const roles = [fakeRole(), fakeRole()];
        const guild = fakeGuild({ channels: [channel], roles });

        const start = await click(guild, "setup:selfroles:new");
        const draftId = customIds(update(start)).find(id => id.startsWith("setup:selfroles:post:")).split(":")[3];
        expect(rowsOf(update(start))[2].components.find(c => c.custom_id.includes(":post:")).disabled).toBe(true);

        await click(guild, `setup:selfroles:newchannel:${draftId}`, { values: [channel.id] });
        await click(guild, `setup:selfroles:newroles:${draftId}`, { values: roles.map(r => r.id) });
        const text = await submit(guild, `setup:selfroles:newtext:${draftId}`, { title: "Colors", description: "" });
        expect(update(text).content).toBe("✅ Text saved.");

        const post = await click(guild, `setup:selfroles:post:${draftId}`);
        expect(channel.send).toHaveBeenCalledTimes(1);
        expect(getPanels(guild.id)).toEqual([
            { messageId: "msg1", channelId: channel.id, title: "Colors", description: null, roleIds: roles.map(r => r.id) },
        ]);
        expect(update(post).content).toBe(`✅ Panel posted in <#${channel.id}>.`);
    });

    test("roles the bot can't assign are refused", async () => {
        const role = fakeRole(undefined, { position: 200 });
        const guild = fakeGuild({ roles: [role] });
        const start = await click(guild, "setup:selfroles:new");
        const draftId = customIds(update(start)).find(id => id.startsWith("setup:selfroles:post:")).split(":")[3];
        const pick = await click(guild, `setup:selfroles:newroles:${draftId}`, { values: [role.id] });
        expect(update(pick).content).toContain("equal to or above my highest role");
    });

    test("an expired draft goes back to the list", async () => {
        const interaction = await click(fakeGuild(), "setup:selfroles:post:gone");
        expect(update(interaction).content).toBe("⌛ This preview expired. Run the command again.");
    });

    test("Preview shows the panel with disabled buttons", async () => {
        const roles = [fakeRole()];
        const guild = fakeGuild({ roles });
        const start = await click(guild, "setup:selfroles:new");
        const draftId = customIds(update(start)).find(id => id.startsWith("setup:selfroles:post:")).split(":")[3];
        await click(guild, `setup:selfroles:newroles:${draftId}`, { values: [roles[0].id] });
        await submit(guild, `setup:selfroles:newtext:${draftId}`, { title: "Colors", description: "" });
        const preview = await click(guild, `setup:selfroles:newpreview:${draftId}`);
        const reply = preview.reply.mock.calls[0][0];
        expect(reply.flags).toBe(MessageFlags.Ephemeral);
        expect(reply.components[0].toJSON().components[0].disabled).toBe(true);
    });
});

describe("editing a panel", () => {
    async function posted() {
        const channel = panelChannel();
        const roles = [fakeRole(), fakeRole(), fakeRole()];
        const guild = fakeGuild({ channels: [channel], roles });
        const message = await channel.send(buildSelfRolePanel("Colors", null, roles.slice(0, 1)));
        savePanel(guild.id, { messageId: message.id, channelId: channel.id, title: "Colors", description: null, roleIds: [roles[0].id] });
        return { guild, channel, roles, message };
    }

    test("changing roles edits the posted message and saves", async () => {
        const { guild, roles, message } = await posted();
        const interaction = await click(guild, `setup:selfroles:roles:${message.id}`, { values: roles.map(r => r.id) });
        expect(message.edit).toHaveBeenCalledTimes(1);
        expect(findPanel(guild.id, message.id).roleIds).toEqual(roles.map(r => r.id));
        expect(update(interaction).content).toBe("✅ Panel updated.");
    });

    test("Text edits the posted message", async () => {
        const { guild, message } = await posted();
        const interaction = await submit(guild, `setup:selfroles:text:${message.id}`, { title: "Colours", description: "Pick one" });
        expect(message.edit.mock.calls[0][0].embeds[0].toJSON().title).toBe("Colours");
        expect(findPanel(guild.id, message.id)).toMatchObject({ title: "Colours", description: "Pick one" });
        expect(update(interaction).content).toBe("✅ Panel updated.");
    });

    test("Delete asks first, then deletes the message and the record", async () => {
        const { guild, channel, message } = await posted();
        const ask = await click(guild, `setup:selfroles:delete:${message.id}`);
        expect(customIds(update(ask))).toContain(`setup:selfroles:confirmdelete:${message.id}`);
        expect(channel.messages.delete).not.toHaveBeenCalled();

        const confirm = await click(guild, `setup:selfroles:confirmdelete:${message.id}`);
        expect(channel.messages.delete).toHaveBeenCalledWith(message.id);
        expect(getPanels(guild.id)).toEqual([]);
        expect(update(confirm).content).toBe("🗑️ Deleted **Colors**.");
    });

    test("a panel whose message was deleted is removed from the list", async () => {
        const { guild, channel, roles, message } = await posted();
        channel.stored.delete(message.id);
        const interaction = await click(guild, `setup:selfroles:roles:${message.id}`, { values: [roles[0].id] });
        expect(getPanels(guild.id)).toEqual([]);
        expect(update(interaction).content).toBe("❌ That panel's message was deleted, so I removed it from the list.");
    });
});

describe("adopting an existing panel", () => {
    function guildWithMessage(message) {
        const channel = fakeChannel("c5");
        channel.messages = { fetch: mock(async id => (id === message?.id ? message : Promise.reject(new Error("Unknown")))) };
        return fakeGuild({ channels: [channel] });
    }

    const oldPanel = (authorId = "bot") => {
        const payload = buildSelfRolePanel("Old", "Legacy", [fakeRole("r7")]);
        return {
            id: "m5",
            channelId: "c5",
            author: { id: authorId },
            embeds: [payload.embeds[0].toJSON()],
            components: payload.components.map(row => ({ components: row.toJSON().components.map(c => ({ customId: c.custom_id })) })),
        };
    };

    test("a link to the bot's panel adds it and opens it", async () => {
        const guild = guildWithMessage(oldPanel());
        const interaction = await submit(guild, "setup:selfroles:adopt", { link: `https://discord.com/channels/${guild.id}/c5/m5` });
        expect(findPanel(guild.id, "m5")).toEqual({ messageId: "m5", channelId: "c5", title: "Old", description: "Legacy", roleIds: ["r7"] });
        expect(update(interaction).content).toBe("✅ Added **Old** to the list.");
    });

    test("bad links get a notice", async () => {
        const guild = guildWithMessage(oldPanel("someone"));
        const cases = [
            ["not a link", "❌ That link isn't a message in this server."],
            ["https://discord.com/channels/999/c5/m5", "❌ That link isn't a message in this server."],
            [`https://discord.com/channels/${guild.id}/c5/missing`, "❌ I can't find that message."],
            [`https://discord.com/channels/${guild.id}/c5/m5`, "❌ That isn't a self-role panel I posted."],
        ];
        for (const [link, notice] of cases) {
            const interaction = await submit(guild, "setup:selfroles:adopt", { link });
            expect(update(interaction).content).toBe(notice);
        }
    });
});

describe("views", () => {
    test("new, edit and delete-confirm views stay within Discord limits", async () => {
        const channel = panelChannel();
        const roles = Array.from({ length: 25 }, () => fakeRole());
        const guild = fakeGuild({ channels: [channel], roles });
        savePanel(guild.id, { messageId: "m1", channelId: channel.id, title: "x".repeat(200), description: "d", roleIds: roles.map(r => r.id) });
        const interaction = fakeInteraction({ guild });

        const start = await click(guild, "setup:selfroles:new");
        expectWithinDiscordLimits(update(start));
        expectWithinDiscordLimits(selfroles.view(interaction, undefined, { messageId: "m1" }));
        expectWithinDiscordLimits(selfroles.view(interaction, undefined, { messageId: "m1", confirmDelete: true }));
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test test/setupSelfRoles.test.js`
Expected: FAIL. The current section has no list, new or edit views.

- [ ] **Step 4: Rewrite `lib/setup/sections/selfroles.js`**

```js
const {
    PermissionFlagsBits, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
    MessageFlags,
} = require("discord.js");
const { checkAssignableRole } = require("../../moderation");
const { MAX_SELF_ROLES, buildSelfRolePanel } = require("../../selfRoles");
const { getPanels, findPanel, savePanel, removePanel, parseMessageLink, readPanelMessage } = require("../../selfRolePanels");
const { missingChannelPermissions, SEND_EMBED_PERMISSIONS } = require("../../channelChecks");
const { saveDraft, getDraft, dropDraft, EXPIRED } = require("../../preview");
const {
    sectionView, channelPicker, rolePicker, buttonRow, button, channelText, roleText, pickedChannel, CHANNEL_GONE, savedChannel, savedRoles,
} = require("../ui");

const PANEL_GONE = "❌ That panel's message was deleted, so I removed it from the list.";
const NOT_LISTED = "❌ That panel is no longer in the list.";

const rolesOf = (guild, roleIds) => roleIds.map(id => guild.roles.cache.get(id)).filter(Boolean);

// Returns an error message if any picked role can't be handed out by the bot, otherwise null
function rolesError(interaction, roles) {
    if (!roles.length) return "❌ I can't find those roles.";
    for (const role of roles) {
        const error = checkAssignableRole(interaction, role);
        if (error) return error;
    }
    return null;
}

// The panel as it would be posted, with buttons disabled so a preview can't change anyone's roles
function previewPayload(guild, panel) {
    const payload = buildSelfRolePanel(panel.title, panel.description, rolesOf(guild, panel.roleIds));
    for (const row of payload.components) for (const component of row.components) component.setDisabled(true);
    return { ...payload, flags: MessageFlags.Ephemeral };
}

function textModal(customId, current) {
    const title = new TextInputBuilder()
        .setCustomId("title").setLabel("Title").setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(true);
    const description = new TextInputBuilder()
        .setCustomId("description").setLabel("Text shown above the buttons (empty = default)").setStyle(TextInputStyle.Paragraph)
        .setMaxLength(1000).setRequired(false);
    if (current.title) title.setValue(current.title);
    if (current.description) description.setValue(current.description);
    return new ModalBuilder().setCustomId(customId).setTitle("Self-role panel").addComponents(
        new ActionRowBuilder().addComponents(title),
        new ActionRowBuilder().addComponents(description),
    );
}

function listView(interaction, notice) {
    const { guild } = interaction;
    const panels = getPanels(guild.id);
    const shown = panels.slice(0, 25);
    const lines = [
        "Panels of buttons members click to give themselves roles.",
        "",
        panels.length
            ? `**${panels.length}** panel(s). Pick one to change its roles or text.`
            : "No panels yet. Make one with **➕ New panel**, or add one posted earlier with **🔗 Add existing panel**.",
    ];
    if (panels.length > shown.length) lines.push(`…only the first 25 fit in the menu.`);

    const components = [];
    if (shown.length) {
        components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId("setup:selfroles:open")
            .setPlaceholder("Pick a panel to edit…")
            .addOptions(shown.map(p => ({
                label: `${p.title.slice(0, 60)} · #${(guild.channels.cache.get(p.channelId)?.name ?? "deleted-channel").slice(0, 30)}`,
                value: p.messageId,
            })))));
    }
    components.push(buttonRow(
        button("setup:selfroles:new", "➕ New panel", ButtonStyle.Success),
        button("setup:selfroles:adopt", "🔗 Add existing panel"),
    ));
    return sectionView(section, lines.join("\n"), components, notice);
}

function newView(interaction, notice, draftId) {
    const draft = getDraft(draftId);
    if (!draft) return listView(interaction, EXPIRED.content);
    const { guild } = interaction;
    const ready = draft.channelId && draft.roleIds.length && draft.title;
    const description = [
        "**New panel**",
        "",
        `**Channel:** ${channelText(draft.channelId)}`,
        `**Title:** ${draft.title || "*not set, use ✏️ Text*"}`,
        `**Text:** ${draft.description || "*default*"}`,
        `**Roles:** ${draft.roleIds.length ? draft.roleIds.map(roleText).join(" ") : "*none yet*"}`,
    ].join("\n");
    return sectionView(section, description, [
        channelPicker(`setup:selfroles:newchannel:${draftId}`, savedChannel(guild, draft.channelId), { placeholder: "Post it in…" }),
        rolePicker(`setup:selfroles:newroles:${draftId}`, savedRoles(guild, ...draft.roleIds), {
            placeholder: `Pick up to ${MAX_SELF_ROLES} roles…`, max: MAX_SELF_ROLES,
        }),
        new ActionRowBuilder().addComponents(
            button(`setup:selfroles:newtext:${draftId}`, "✏️ Text"),
            button(`setup:selfroles:newpreview:${draftId}`, "👁️ Preview").setDisabled(!draft.roleIds.length || !draft.title),
            button(`setup:selfroles:post:${draftId}`, "📤 Post", ButtonStyle.Primary).setDisabled(!ready),
        ),
        buttonRow(button("setup:selfroles:list", "◀ Back")),
    ], notice);
}

function editView(interaction, notice, messageId, confirmDelete = false) {
    const { guild } = interaction;
    const panel = findPanel(guild.id, messageId);
    if (!panel) return listView(interaction, NOT_LISTED);
    const description = [
        `**Panel:** ${panel.title}`,
        `**Channel:** ${channelText(panel.channelId)} · [jump to message](https://discord.com/channels/${guild.id}/${panel.channelId}/${panel.messageId})`,
        `**Text:** ${panel.description || "*default*"}`,
        `**Roles (${panel.roleIds.length}):** ${panel.roleIds.map(roleText).join(" ")}`,
        "",
        "Changing the roles or text updates the posted panel right away.",
    ].join("\n");
    const actions = confirmDelete
        ? new ActionRowBuilder().addComponents(
            button(`setup:selfroles:confirmdelete:${messageId}`, "Confirm delete", ButtonStyle.Danger),
            button(`setup:selfroles:edit:${messageId}`, "Cancel"),
        )
        : new ActionRowBuilder().addComponents(
            button(`setup:selfroles:text:${messageId}`, "✏️ Text"),
            button(`setup:selfroles:preview:${messageId}`, "👁️ Preview"),
            button(`setup:selfroles:delete:${messageId}`, "🗑️ Delete panel", ButtonStyle.Danger),
        );
    return sectionView(section, description, [
        rolePicker(`setup:selfroles:roles:${messageId}`, savedRoles(guild, ...panel.roleIds), {
            placeholder: "Roles on this panel…", max: MAX_SELF_ROLES,
        }),
        actions,
        buttonRow(button("setup:selfroles:list", "◀ Back")),
    ], notice);
}

// Re-posts a changed panel into its message and saves it; drops panels whose message is gone
async function applyPanel(interaction, panel) {
    const { guild } = interaction;
    const channel = guild.channels.cache.get(panel.channelId);
    const message = channel && await channel.messages.fetch(panel.messageId).catch(() => null);
    if (!message) {
        removePanel(guild.id, panel.messageId);
        return interaction.update(listView(interaction, PANEL_GONE));
    }
    const payload = buildSelfRolePanel(panel.title, panel.description, rolesOf(guild, panel.roleIds));
    const edited = await message.edit(payload).then(() => true, () => false);
    if (!edited) return interaction.update(editView(interaction, "❌ I couldn't edit that panel.", panel.messageId));
    savePanel(guild.id, panel);
    return interaction.update(editView(interaction, "✅ Panel updated.", panel.messageId));
}

const section = {
    id: "selfroles",
    label: "Self roles",
    emoji: "🎭",
    permission: PermissionFlagsBits.ManageRoles,

    status(config, guild) {
        const count = getPanels(guild.id).length;
        return count ? `${count} panel${count === 1 ? "" : "s"}` : "no panels";
    },

    view(interaction, notice, mode = {}) {
        if (mode.draftId) return newView(interaction, notice, mode.draftId);
        if (mode.messageId) return editView(interaction, notice, mode.messageId, mode.confirmDelete);
        return listView(interaction, notice);
    },

    async handleComponent(interaction, action, arg) {
        const { guild } = interaction;

        if (action === "list") return interaction.update(listView(interaction));
        if (action === "open") return interaction.update(editView(interaction, undefined, interaction.values[0]));
        if (action === "edit") return interaction.update(editView(interaction, undefined, arg));
        if (action === "delete") return interaction.update(editView(interaction, undefined, arg, true));
        if (action === "new") {
            const draftId = saveDraft({ channelId: interaction.channelId, roleIds: [], title: null, description: null });
            return interaction.update(newView(interaction, undefined, draftId));
        }
        if (action === "adopt") {
            return interaction.showModal(new ModalBuilder()
                .setCustomId("setup:selfroles:adopt")
                .setTitle("Add an existing panel")
                .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
                    .setCustomId("link").setLabel("Message link (right-click → Copy Message Link)")
                    .setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("https://discord.com/channels/…"))));
        }

        // New panel steps
        if (["newchannel", "newroles", "newtext", "newpreview", "post"].includes(action)) {
            const draft = getDraft(arg);
            if (!draft) return interaction.update(listView(interaction, EXPIRED.content));

            if (action === "newchannel") {
                const channel = pickedChannel(interaction);
                const error = channel ? missingChannelPermissions(channel, guild.members.me, SEND_EMBED_PERMISSIONS) : CHANNEL_GONE;
                if (!error) draft.channelId = channel.id;
                return interaction.update(newView(interaction, error ?? `✅ It will be posted in ${channel}.`, arg));
            }
            if (action === "newroles") {
                const roles = rolesOf(guild, interaction.values);
                const error = rolesError(interaction, roles);
                if (!error) draft.roleIds = roles.map(r => r.id);
                return interaction.update(newView(interaction, error ?? `✅ ${roles.length} role(s) picked.`, arg));
            }
            if (action === "newtext") return interaction.showModal(textModal(`setup:selfroles:newtext:${arg}`, draft));
            if (action === "newpreview") return interaction.reply(previewPayload(guild, draft));

            // post
            const channel = guild.channels.cache.get(draft.channelId);
            if (!channel) return interaction.update(newView(interaction, CHANNEL_GONE, arg));
            const roles = rolesOf(guild, draft.roleIds);
            const error = rolesError(interaction, roles) ?? (draft.title ? null : "❌ Set a title with ✏️ Text first.");
            if (error) return interaction.update(newView(interaction, error, arg));
            const message = await channel.send(buildSelfRolePanel(draft.title, draft.description, roles)).catch(() => null);
            if (!message) return interaction.update(newView(interaction, `❌ I couldn't post in ${channel}.`, arg));
            savePanel(guild.id, {
                messageId: message.id, channelId: channel.id, title: draft.title, description: draft.description, roleIds: roles.map(r => r.id),
            });
            dropDraft(arg);
            return interaction.update(editView(interaction, `✅ Panel posted in ${channel}.`, message.id));
        }

        // Existing panel steps
        if (["roles", "text", "preview", "confirmdelete"].includes(action)) {
            const panel = findPanel(guild.id, arg);
            if (!panel) return interaction.update(listView(interaction, NOT_LISTED));

            if (action === "roles") {
                const roles = rolesOf(guild, interaction.values);
                const error = rolesError(interaction, roles);
                if (error) return interaction.update(editView(interaction, error, arg));
                return applyPanel(interaction, { ...panel, roleIds: roles.map(r => r.id) });
            }
            if (action === "text") return interaction.showModal(textModal(`setup:selfroles:text:${arg}`, panel));
            if (action === "preview") return interaction.reply(previewPayload(guild, panel));

            // confirmdelete
            const channel = guild.channels.cache.get(panel.channelId);
            await channel?.messages.delete(panel.messageId).catch(() => {});
            removePanel(guild.id, panel.messageId);
            return interaction.update(listView(interaction, `🗑️ Deleted **${panel.title}**.`));
        }
    },

    async handleModal(interaction, action, arg) {
        const { guild } = interaction;

        if (action === "adopt") {
            const link = parseMessageLink(interaction.fields.getTextInputValue("link"));
            if (!link || link.guildId !== guild.id) return interaction.update(listView(interaction, "❌ That link isn't a message in this server."));
            const channel = guild.channels.cache.get(link.channelId);
            const message = channel && await channel.messages.fetch(link.messageId).catch(() => null);
            if (!message) return interaction.update(listView(interaction, "❌ I can't find that message."));
            const panel = readPanelMessage(message, interaction.client.user.id);
            if (!panel) return interaction.update(listView(interaction, "❌ That isn't a self-role panel I posted."));
            savePanel(guild.id, panel);
            return interaction.update(editView(interaction, `✅ Added **${panel.title}** to the list.`, panel.messageId));
        }

        const title = interaction.fields.getTextInputValue("title").trim();
        const description = interaction.fields.getTextInputValue("description").trim() || null;

        if (action === "newtext") {
            const draft = getDraft(arg);
            if (!draft) return interaction.update(listView(interaction, EXPIRED.content));
            if (!title) return interaction.update(newView(interaction, "❌ The title can't be empty.", arg));
            Object.assign(draft, { title, description });
            return interaction.update(newView(interaction, "✅ Text saved.", arg));
        }
        if (action === "text") {
            const panel = findPanel(guild.id, arg);
            if (!panel) return interaction.update(listView(interaction, NOT_LISTED));
            if (!title) return interaction.update(editView(interaction, "❌ The title can't be empty.", arg));
            return applyPanel(interaction, { ...panel, title, description });
        }
    },
};

module.exports = section;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test`
Expected: PASS, 0 fail. That includes the generic view tests, whose filled list view has 30 panels with long titles.

- [ ] **Step 6: Commit**

```bash
git add lib/setup/sections/selfroles.js test/limits.js test/setupViews.test.js test/setupFaqSelfRoles.test.js test/setupSelfRoles.test.js
git commit -m "Manage self-role panels from /setup: new, edit, delete, adopt"
```

---

### Task 8: Full check

**Files:** none

- [ ] **Step 1: Run the suite and the loader**

Run: `bun test`
Expected: PASS, 0 fail.

Run: `bun -e "const fs=require('fs');const n=fs.readdirSync('commands').filter(f=>f.endsWith('.js')).map(f=>require('./commands/'+f)).filter(c=>'data' in c&&'execute' in c);console.log(n.length)"`
Expected: `51`

Deploying and the manual Discord checks happen after the `/mod` plan, as one deploy.
