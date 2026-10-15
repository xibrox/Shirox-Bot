# /setup Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/setup <entry> <subcommand>` / `/mod <entry>` groups with a single `/setup` command that opens a private, interactive settings dashboard.

**Architecture:** `commands/setup.js` renders a Home view and routes every `setup:<section>:<action>[:<arg>]` component and modal to a section module in `lib/setup/sections/`. Each section owns its view and handlers. Checks the slash commands already run are moved into small `lib/` helpers so the slash commands and the dashboard share them.

**Tech Stack:** Bun, discord.js 14.27 (buttons, `StringSelectMenuBuilder`, `ChannelSelectMenuBuilder`, `RoleSelectMenuBuilder`, `ModalBuilder`), `bun test`.

**Spec:** `docs/superpowers/specs/2026-10-15-setup-dashboard-design.md`

## Global Constraints

- Use bun only: `bun test`, `bun run deploy`. Never npm/npx.
- Old slash commands (`/welcome`, `/goodbye`, `/logs`, `/honeypot`, `/automod`, `/autorole`, `/restoreroles`, `/faqmanage`, `/selfroles`, `/ban`, ...) keep working, with the same replies.
- `/setup`: no options, `setDefaultMemberPermissions(ManageGuild)`, `setDMPermission(false)`, category `setup`, replies ephemerally.
- Custom IDs: `setup:<section>:<action>[:<arg>]`, at most 100 characters. Home uses `setup:home:open` (menu) and `setup:home:show` (◀ Home button).
- Every section view: at most 5 rows, at most 25 menu options, and the last row ends with the `◀ Home` button.
- Fixed texts:
  - Footer: `Only you can see this. Changes save immediately.`
  - No sections: `❌ You don't have permission to change any settings.`
  - Stale: `⚠️ This dashboard is out of date. Run /setup again.`
  - Permission: `❌ You need **<Permission>** for this.`, using UI names (Manage Server, Manage Roles, Administrator).
- Code style: `lib/` and `test/` use double quotes and 4-space indents. `commands/` uses single quotes and 2-space indents. Comments are sparse and explain why.
- Commits: plain sentence messages like the existing history, with **no** `Co-Authored-By` trailer.

## Review Focus

- A view that breaks a Discord limit (rows, options, label or custom ID length) is rejected at runtime with "interaction failed". The generic view test in Task 5 renders every section with empty settings and with full settings (including 30 FAQs with 190-character questions).
- A dashboard left open while the bot restarts or updates must not crash. Unknown section or action gives the out-of-date reply (Task 5). An expired self-role draft gives the expired notice (Task 9).
- A member who loses a permission after opening the dashboard must be refused when they click (Task 5 permission re-check test).
- A channel deleted between opening the dashboard and picking it (`values[0]` not in cache) gets `❌ I can't see that channel.`, not a crash (Task 5 logs test).
- Forms opened from the dashboard (`showModal` from a button or menu) and then `update()` on submit cannot be faked faithfully. They are checked manually in Task 10.

## File Structure

- Delete: `lib/commandGroup.js`, `commands/mod.js`, `test/commandGroup.test.js`, `test/groups.test.js`, `test/help.test.js`.
- Restore: `commands/help.js` from commit `df38827`.
- Create `bunfig.toml` and `test/preload.js`: tests write settings to a temp folder, not `data/`.
- Create `test/fakes.js`: fake guild, channel, role and interaction objects.
- Modify `lib/jsonFile.js`: `DATA_DIR` can be overridden by `process.env.DATA_DIR`.
- Create `lib/permissions.js`: `permissionNames(bits)` (UI names) and `listText(items)`.
- Create `lib/channelChecks.js`: `missingChannelPermissions(channel, member, perms)` and `SEND_EMBED_PERMISSIONS`.
- Create `lib/honeypot.js`: `ACTION_LABELS`, `honeypotError`, `honeypotWarningEmbed`.
- Create `lib/restoreRoles.js`: `setRestoreRoles`, `RESTORE_RULES`, `AUTOROLE_NOTE`.
- Create `lib/selfRoles.js`: `buildSelfRolePanel`, `MAX_SELF_ROLES`.
- Modify `lib/faq.js`: add `faqModal` (moved from `commands/faqmanage.js`) and `faqPanel`.
- Modify `commands/welcome.js`, `goodbye.js`, `logs.js`, `honeypot.js`, `restoreroles.js`, `selfroles.js` and `faqmanage.js` to use those helpers.
- Create `lib/setup/ui.js`: shared view helpers.
- Create `lib/setup/sections/index.js`: ordered `SECTIONS`.
- Create section files in `lib/setup/sections/`: `logs.js`, `greeting.js` (factory), `welcome.js`, `goodbye.js`, `honeypot.js`, `automod.js`, `autorole.js`, `restoreroles.js`, `faq.js`, `selfroles.js`.
- Create `commands/setup.js`: the dashboard command, Home view and router.
- Tests: `test/permissions.test.js`, `test/jsonFile.test.js`, `test/honeypot.test.js`, `test/restoreRoles.test.js`, `test/selfRoles.test.js`, `test/faqHelpers.test.js`, `test/setup.test.js`, `test/setupViews.test.js`, `test/setupGreeting.test.js`, `test/setupHoneypotAutomod.test.js`, `test/setupRoles.test.js`, `test/setupFaqSelfRoles.test.js`.

`index.js` and `deploy-commands.js` need no changes. `index.js` already routes the `setup:` prefix to `commands/setup.js` → `handleComponent` / `handleModal`.

---

### Task 1: Remove the command groups

**Files:**
- Delete: `lib/commandGroup.js`, `commands/mod.js`, `commands/setup.js`, `test/commandGroup.test.js`, `test/groups.test.js`, `test/help.test.js`
- Restore: `commands/help.js`

**Interfaces:**
- Consumes: nothing.
- Produces: a tree with no `/setup` or `/mod` commands. `package.json` keeps `"test": "bun test"`.

- [ ] **Step 1: Remove the files and restore help**

```bash
git rm -q lib/commandGroup.js commands/mod.js commands/setup.js test/commandGroup.test.js test/groups.test.js test/help.test.js
git checkout df38827 -- commands/help.js
```

- [ ] **Step 2: Verify help matches the pre-grouping version and the loader is clean**

Run: `git diff --quiet df38827 -- commands/help.js && echo same`
Expected: `same`

Run: `bun -e "const fs=require('fs');const n=fs.readdirSync('commands').filter(f=>f.endsWith('.js')).map(f=>require('./commands/'+f)).filter(c=>'data' in c&&'execute' in c).map(c=>c.data.toJSON().name);console.log(n.length, n.includes('setup'), n.includes('mod'), n.includes('ban'))"`
Expected: `50 false false true`

- [ ] **Step 3: Commit**

```bash
git add -A commands lib test
git commit -m "Remove /setup and /mod command groups"
```

---

### Task 2: Test isolation, permission names and channel checks

**Files:**
- Create: `bunfig.toml`, `test/preload.js`, `test/fakes.js`, `lib/permissions.js`, `lib/channelChecks.js`
- Modify: `lib/jsonFile.js`, `commands/welcome.js`, `commands/goodbye.js`, `commands/logs.js`
- Test: `test/jsonFile.test.js`, `test/permissions.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `require("./fakes")` → `{ fakeChannel(id?, botPermissions?), fakeRole(id?, { position, managed }?), fakeGuild({ botPermissions, channels, roles }?), fakeInteraction({ guild, permissions, customId, values, fields }?) }`.
  - `lib/permissions.js` → `permissionNames(bits): string[]`, `listText(items: string[]): string`.
  - `lib/channelChecks.js` → `missingChannelPermissions(channel, member, perms): string | null`, `SEND_EMBED_PERMISSIONS: bigint[]`.
  - `lib/jsonFile.js` additionally exports `DATA_DIR`.

- [ ] **Step 1: Add the test preload and fakes**

`bunfig.toml`:

```toml
[test]
preload = ["./test/preload.js"]
```

`test/preload.js`:

```js
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Tests save settings through the real stores; keep them out of the bot's data/ folder
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "shirox-test-"));
```

`test/fakes.js`:

```js
const { mock } = require("bun:test");
const { Collection, PermissionsBitField, PermissionFlagsBits } = require("discord.js");

let nextId = 0;
const uniqueId = prefix => `${prefix}${++nextId}`;

function fakeChannel(id = uniqueId("channel"), botPermissions = PermissionFlagsBits.Administrator) {
    return {
        id,
        permissionsFor: () => new PermissionsBitField(botPermissions),
        send: mock(async () => {}),
        toString: () => `<#${id}>`,
    };
}

function fakeRole(id = uniqueId("role"), { position = 1, managed = false } = {}) {
    return { id, position, managed, name: `Role ${id}`, toString: () => `<@&${id}>` };
}

// Every guild gets its own id, so settings saved by one test never leak into another
function fakeGuild({ botPermissions = PermissionFlagsBits.Administrator, channels = [], roles = [] } = {}) {
    return {
        id: uniqueId("guild"),
        name: "Test Server",
        ownerId: "owner",
        iconURL: () => null,
        members: {
            me: { permissions: new PermissionsBitField(botPermissions), roles: { highest: { position: 100 } } },
            fetch: mock(async () => {}),
        },
        channels: { cache: new Collection(channels.map(c => [c.id, c])) },
        roles: { cache: new Collection(roles.map(r => [r.id, r])) },
    };
}

function fakeInteraction({ guild = fakeGuild(), permissions = PermissionFlagsBits.Administrator, customId = "", values = [], fields = {} } = {}) {
    const interaction = {
        guild,
        customId,
        values,
        user: { id: "moderator" },
        member: { roles: { highest: { position: 50 } } },
        memberPermissions: new PermissionsBitField(permissions),
        channel: fakeChannel("here"),
        fields: { getTextInputValue: name => fields[name] ?? "" },
        replied: false,
        deferred: false,
    };
    for (const method of ["reply", "update", "showModal"]) {
        interaction[method] = mock(async () => { interaction.replied = true; });
    }
    return interaction;
}

module.exports = { fakeChannel, fakeRole, fakeGuild, fakeInteraction };
```

- [ ] **Step 2: Write the failing tests**

`test/jsonFile.test.js`:

```js
const { test, expect } = require("bun:test");
const path = require("node:path");
const { DATA_DIR } = require("../lib/jsonFile");

test("tests never write to the bot's data folder", () => {
    expect(DATA_DIR).toBe(process.env.DATA_DIR);
    expect(DATA_DIR).not.toBe(path.join(__dirname, "..", "data"));
});
```

`test/permissions.test.js`:

```js
const { describe, test, expect } = require("bun:test");
const { PermissionFlagsBits: P } = require("discord.js");
const { permissionNames, listText } = require("../lib/permissions");
const { missingChannelPermissions, SEND_EMBED_PERMISSIONS } = require("../lib/channelChecks");
const { fakeChannel } = require("./fakes");

describe("permissionNames", () => {
    test("uses the names Discord shows in its settings", () => {
        expect(permissionNames(P.ManageGuild)).toEqual(["Manage Server"]);
        expect(permissionNames(P.ModerateMembers)).toEqual(["Timeout Members"]);
    });

    test("splits other flag names into words", () => {
        expect(permissionNames([P.ViewChannel, P.SendMessages])).toEqual(["View Channel", "Send Messages"]);
    });
});

describe("listText", () => {
    test("joins with commas and a final and", () => {
        expect(listText(["a"])).toBe("a");
        expect(listText(["a", "b"])).toBe("a and b");
        expect(listText(["a", "b", "c"])).toBe("a, b and c");
    });
});

describe("missingChannelPermissions", () => {
    test("returns null when the bot has every permission", () => {
        const channel = fakeChannel("1", P.ViewChannel | P.SendMessages | P.EmbedLinks);
        expect(missingChannelPermissions(channel, {}, SEND_EMBED_PERMISSIONS)).toBeNull();
    });

    test("lists every needed permission when any is missing, like the commands always did", () => {
        const channel = fakeChannel("1", P.ViewChannel);
        expect(missingChannelPermissions(channel, {}, SEND_EMBED_PERMISSIONS))
            .toBe("❌ I need View Channel, Send Messages and Embed Links in <#1>.");
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test`
Expected: FAIL. `jsonFile.test.js` fails because `DATA_DIR` is undefined. `permissions.test.js` errors with `Cannot find module '../lib/permissions'`.

- [ ] **Step 4: Implement**

In `lib/jsonFile.js`, change the `DATA_DIR` line and the export:

```js
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
```

```js
module.exports = { loadJsonFile, DATA_DIR };
```

`lib/permissions.js`:

```js
const { PermissionsBitField } = require("discord.js");

// Names as Discord's settings show them, where they differ from the API flag names
const UI_NAMES = { ManageGuild: "Manage Server", ModerateMembers: "Timeout Members" };

// Permission bits -> readable names, e.g. ["Manage Server"]
function permissionNames(bits) {
    return new PermissionsBitField(bits).toArray().map(flag => UI_NAMES[flag] ?? flag.replace(/(?<=[a-z])(?=[A-Z])/g, " "));
}

// ["a", "b", "c"] -> "a, b and c"
function listText(items) {
    return items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : (items[0] ?? "");
}

module.exports = { permissionNames, listText };
```

`lib/channelChecks.js`:

```js
const { PermissionFlagsBits } = require("discord.js");
const { permissionNames, listText } = require("./permissions");

// What the bot needs to post embeds in a channel (welcome, goodbye, logs, FAQ panels)
const SEND_EMBED_PERMISSIONS = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];

// Returns an error message if `member` (usually the bot) lacks any of `perms` in `channel`, otherwise null
function missingChannelPermissions(channel, member, perms) {
    if (channel.permissionsFor(member)?.has(perms)) return null;
    return `❌ I need ${listText(permissionNames(perms))} in ${channel}.`;
}

module.exports = { missingChannelPermissions, SEND_EMBED_PERMISSIONS };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test`
Expected: PASS, 6 tests.

- [ ] **Step 6: Use the channel check in welcome, goodbye and logs**

In `commands/welcome.js` and `commands/goodbye.js`, add this import below the other `require` lines:

```js
const { missingChannelPermissions, SEND_EMBED_PERMISSIONS } = require('../lib/channelChecks');
```

In both files, replace this block in the `set` branch:

```js
      const perms = channel.permissionsFor(interaction.guild.members.me);
      if (!perms.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        return interaction.reply({ content: `❌ I need View Channel, Send Messages and Embed Links in ${channel}.`, flags: MessageFlags.Ephemeral });
      }
```

with:

```js
      const error = missingChannelPermissions(channel, interaction.guild.members.me, SEND_EMBED_PERMISSIONS);
      if (error) return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });
```

In `commands/logs.js`, add the same import. Then replace:

```js
      if (!channel.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        return interaction.reply({ content: `❌ I need View Channel, Send Messages and Embed Links in ${channel}.`, flags: MessageFlags.Ephemeral });
      }
```

with:

```js
      const error = missingChannelPermissions(channel, me, SEND_EMBED_PERMISSIONS);
      if (error) return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });
```

`PermissionFlagsBits` is still used by `setDefaultMemberPermissions` in all three files, so keep that import.

- [ ] **Step 7: Verify the commands still load and tests pass**

Run: `bun -e "for (const f of ['welcome','goodbye','logs']) require('./commands/'+f).data.toJSON(); console.log('ok')" && bun test`
Expected: `ok`, then PASS, 6 tests.

- [ ] **Step 8: Commit**

```bash
git add bunfig.toml test/preload.js test/fakes.js test/jsonFile.test.js test/permissions.test.js lib/jsonFile.js lib/permissions.js lib/channelChecks.js commands/welcome.js commands/goodbye.js commands/logs.js
git commit -m "Share channel permission checks and keep test data out of data/"
```

---

### Task 3: Honeypot and role restore helpers

**Files:**
- Create: `lib/honeypot.js`, `lib/restoreRoles.js`
- Modify: `commands/honeypot.js`, `commands/restoreroles.js`
- Test: `test/honeypot.test.js`, `test/restoreRoles.test.js`

**Interfaces:**
- Consumes: `missingChannelPermissions` (Task 2), and `fakeGuild`/`fakeChannel` (Task 2).
- Produces:
  - `lib/honeypot.js` → `ACTION_LABELS: { softban, ban, kick }`, `honeypotError(guild, channel, action): string | null`, `honeypotWarningEmbed(action): EmbedBuilder`.
  - `lib/restoreRoles.js` → `setRestoreRoles(guild, enabled: boolean): string | null`, `RESTORE_RULES: string`, `AUTOROLE_NOTE: string`.

- [ ] **Step 1: Write the failing tests**

`test/honeypot.test.js`:

```js
const { test, expect } = require("bun:test");
const { PermissionFlagsBits: P } = require("discord.js");
const { honeypotError, honeypotWarningEmbed } = require("../lib/honeypot");
const { fakeGuild, fakeChannel } = require("./fakes");

test("soft ban and ban need Ban Members", () => {
    const guild = fakeGuild({ botPermissions: P.KickMembers });
    expect(honeypotError(guild, fakeChannel(), "softban")).toBe("❌ I need the **Ban Members** permission for this.");
    expect(honeypotError(guild, fakeChannel(), "ban")).toBe("❌ I need the **Ban Members** permission for this.");
    expect(honeypotError(guild, fakeChannel(), "kick")).toBeNull();
});

test("kick needs Kick Members", () => {
    const guild = fakeGuild({ botPermissions: P.BanMembers });
    expect(honeypotError(guild, fakeChannel(), "kick")).toBe("❌ I need the **Kick Members** permission for this.");
});

test("the bot must be able to see and clean the channel", () => {
    const channel = fakeChannel("7", P.ViewChannel);
    expect(honeypotError(fakeGuild(), channel, "softban")).toBe("❌ I need View Channel and Manage Messages in <#7>.");
});

test("the warning says what happens to people who post", () => {
    expect(honeypotWarningEmbed("kick").toJSON().description).toContain("automatically kicked");
    expect(honeypotWarningEmbed("ban").toJSON().description).toContain("automatically banned");
    expect(honeypotWarningEmbed("softban").toJSON().description).toContain("removed from the server");
});
```

`test/restoreRoles.test.js`:

```js
const { test, expect } = require("bun:test");
const { PermissionFlagsBits: P } = require("discord.js");
const { setRestoreRoles } = require("../lib/restoreRoles");
const { getGuildConfig, updateGuildConfig } = require("../lib/guildConfig");
const { fakeGuild } = require("./fakes");

test("enabling saves the setting and caches members", () => {
    const guild = fakeGuild();
    expect(setRestoreRoles(guild, true)).toBeNull();
    expect(getGuildConfig(guild.id).restoreRoles).toBe(true);
    expect(guild.members.fetch).toHaveBeenCalled();
});

test("enabling needs Manage Roles", () => {
    const guild = fakeGuild({ botPermissions: P.KickMembers });
    expect(setRestoreRoles(guild, true)).toBe("❌ I need the **Manage Roles** permission for this.");
    expect(getGuildConfig(guild.id).restoreRoles).toBeUndefined();
});

test("disabling works without permissions", () => {
    const guild = fakeGuild({ botPermissions: 0n });
    updateGuildConfig(guild.id, { restoreRoles: true });
    expect(setRestoreRoles(guild, false)).toBeNull();
    expect(getGuildConfig(guild.id).restoreRoles).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/honeypot.test.js test/restoreRoles.test.js`
Expected: FAIL with `Cannot find module '../lib/honeypot'` and `Cannot find module '../lib/restoreRoles'`.

- [ ] **Step 3: Implement**

`lib/honeypot.js`:

```js
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { COLORS } = require("./colors");
const { missingChannelPermissions } = require("./channelChecks");

const ACTION_LABELS = {
    softban: "Soft ban (ban + instant unban, deletes their last 24h of messages)",
    ban: "Ban (deletes their last 24h of messages)",
    kick: "Kick",
};

const ACTION_RESULTS = {
    softban: "removed from the server and has their recent messages deleted",
    ban: "banned",
    kick: "kicked",
};

// Returns an error message if the honeypot can't work in `channel` with `action`, otherwise null
function honeypotError(guild, channel, action) {
    const me = guild.members.me;
    const kick = action === "kick";
    if (!me.permissions.has(kick ? PermissionFlagsBits.KickMembers : PermissionFlagsBits.BanMembers)) {
        return `❌ I need the **${kick ? "Kick" : "Ban"} Members** permission for this.`;
    }
    return missingChannelPermissions(channel, me, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageMessages]);
}

// The "do not type here" notice posted in the trap channel
function honeypotWarningEmbed(action) {
    return new EmbedBuilder()
        .setColor(COLORS.danger)
        .setTitle("⚠️ DO NOT SEND MESSAGES IN THIS CHANNEL")
        .setDescription(
            "This channel is a trap for hacked accounts and spam bots.\n\n" +
            `Anyone who posts here is **automatically ${ACTION_RESULTS[action] ?? ACTION_RESULTS.softban}**.`,
        );
}

module.exports = { ACTION_LABELS, honeypotError, honeypotWarningEmbed };
```

`lib/restoreRoles.js`:

```js
const { PermissionFlagsBits } = require("discord.js");
const { updateGuildConfig } = require("./guildConfig");

const RESTORE_RULES = [
    "When a member leaves, their roles and nickname are saved and given back if they rejoin.",
    "• Banned members are never restored.",
    "• Roles with **Administrator**, or above my highest role, are skipped for safety.",
    "• Only members who leave *after* enabling this are saved.",
].join("\n");

const AUTOROLE_NOTE = "ℹ️ Your auto role will still be given to everyone who joins, including returning members.";

// Turns role restore on or off. Returns an error message, or null when saved.
function setRestoreRoles(guild, enabled) {
    if (enabled && !guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return "❌ I need the **Manage Roles** permission for this.";
    }
    updateGuildConfig(guild.id, { restoreRoles: enabled || null });
    // Cache everyone's roles now so members who leave before ever being seen still get saved
    if (enabled) guild.members.fetch().catch(() => {});
    return null;
}

module.exports = { setRestoreRoles, RESTORE_RULES, AUTOROLE_NOTE };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test`
Expected: PASS, 13 tests.

- [ ] **Step 5: Use the helpers in the commands**

In `commands/honeypot.js`:

- Change the discord.js import to `const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');`.
- Replace `const { COLORS } = require('../lib/colors');` with `const { ACTION_LABELS, honeypotError, honeypotWarningEmbed } = require('../lib/honeypot');`.
- Delete the local `ACTION_LABELS` constant.
- In the `set` branch, replace everything from `const me = interaction.guild.members.me;` through the closing `}` of the `if (postWarning) { ... }` block with:

```js
      const error = honeypotError(interaction.guild, channel, action);
      if (error) return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });

      updateGuildConfig(interaction.guild.id, { honeypotChannelId: channel.id, honeypotAction: action });
      if (postWarning) await channel.send({ embeds: [honeypotWarningEmbed(action)] }).catch(() => {});
```

Replace the whole `execute` of `commands/restoreroles.js` with:

```js
  async execute(interaction) {
    const enabled = interaction.options.getBoolean('enabled');
    const error = setRestoreRoles(interaction.guild, enabled);
    if (error) return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });

    if (!enabled) return interaction.reply({ content: '✅ Role restore disabled.', flags: MessageFlags.Ephemeral });
    await interaction.reply({ content: `✅ Role restore enabled. ${RESTORE_RULES}`, flags: MessageFlags.Ephemeral });
    if (getGuildConfig(interaction.guild.id).autoRoleId) {
      await interaction.followUp({ content: AUTOROLE_NOTE, flags: MessageFlags.Ephemeral });
    }
  },
```

Then change its config import to `const { getGuildConfig } = require('../lib/guildConfig');` and add `const { setRestoreRoles, RESTORE_RULES, AUTOROLE_NOTE } = require('../lib/restoreRoles');`.

- [ ] **Step 6: Verify**

Run: `bun -e "for (const f of ['honeypot','restoreroles']) require('./commands/'+f).data.toJSON(); console.log('ok')" && grep -c "COLORS\|permissionsFor" commands/honeypot.js; bun test`
Expected: `ok`, then `0`, then PASS, 13 tests.

- [ ] **Step 7: Commit**

```bash
git add lib/honeypot.js lib/restoreRoles.js commands/honeypot.js commands/restoreroles.js test/honeypot.test.js test/restoreRoles.test.js
git commit -m "Move honeypot and role restore checks into lib"
```

---

### Task 4: Self-role panel and FAQ helpers

**Files:**
- Create: `lib/selfRoles.js`
- Modify: `lib/faq.js`, `commands/selfroles.js`, `commands/faqmanage.js`
- Test: `test/selfRoles.test.js`, `test/faqHelpers.test.js`

**Interfaces:**
- Consumes: `fakeRole` (Task 2).
- Produces:
  - `lib/selfRoles.js` → `MAX_SELF_ROLES = 10`, `buildSelfRolePanel(title: string, description: string | null, roles: Role[]): { embeds, components }`.
  - `lib/faq.js` additionally exports `faqModal(customId, title, faq?): ModalBuilder` and `faqPanel(faqs): { embeds, components }`.

- [ ] **Step 1: Write the failing tests**

`test/selfRoles.test.js`:

```js
const { test, expect } = require("bun:test");
const { buildSelfRolePanel, MAX_SELF_ROLES } = require("../lib/selfRoles");
const { fakeRole } = require("./fakes");

test("allows up to 10 roles", () => {
    expect(MAX_SELF_ROLES).toBe(10);
});

test("10 roles fit in two rows of five buttons", () => {
    const roles = Array.from({ length: 10 }, (_, i) => fakeRole(`r${i}`));
    const { components } = buildSelfRolePanel("Pick roles", null, roles);
    expect(components.map(row => row.components.length)).toEqual([5, 5]);
    expect(components[0].components[0].toJSON().custom_id).toBe("selfrole:r0");
});

test("uses the default description when none is given", () => {
    const { embeds } = buildSelfRolePanel("Pick roles", null, [fakeRole("r1")]);
    const json = embeds[0].toJSON();
    expect(json.title).toBe("Pick roles");
    expect(json.description).toBe("Click a button to get or remove a role.\n\n• <@&r1>");
});
```

`test/faqHelpers.test.js`:

```js
const { test, expect } = require("bun:test");
const { faqPanel, faqModal } = require("../lib/faq");

test("the panel menu holds at most 25 questions", () => {
    const faqs = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, question: `Question ${i}`, answer: "A" }));
    const menu = faqPanel(faqs).components[0].components[0].toJSON();
    expect(menu.custom_id).toBe("faq:select");
    expect(menu.options.length).toBe(25);
});

test("the edit form is prefilled", () => {
    const json = faqModal("faqmanage:edit:3", "Edit FAQ", { question: "Q?", answer: "A." }).toJSON();
    expect(json.custom_id).toBe("faqmanage:edit:3");
    expect(json.components[0].components[0].value).toBe("Q?");
    expect(json.components[1].components[0].value).toBe("A.");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/selfRoles.test.js test/faqHelpers.test.js`
Expected: FAIL with `Cannot find module '../lib/selfRoles'`, and `faqPanel is not a function`.

- [ ] **Step 3: Implement**

`lib/selfRoles.js`:

```js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { EMBED_COLOR } = require("./colors");

// Two rows of five buttons
const MAX_SELF_ROLES = 10;

// The panel members click to toggle roles; buttons are "selfrole:<roleId>", handled by commands/selfroles.js
function buildSelfRolePanel(title, description, roles) {
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(title)
        .setDescription(`${description || "Click a button to get or remove a role."}\n\n${roles.map(r => `• ${r}`).join("\n")}`);

    const buttons = roles.map(role => new ButtonBuilder()
        .setCustomId(`selfrole:${role.id}`)
        .setLabel(role.name.slice(0, 80))
        .setStyle(ButtonStyle.Secondary));
    const components = [];
    for (let i = 0; i < buttons.length; i += 5) {
        components.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }
    return { embeds: [embed], components };
}

module.exports = { MAX_SELF_ROLES, buildSelfRolePanel };
```

In `lib/faq.js`, add at the top:

```js
const {
    EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require("discord.js");
const { EMBED_COLOR } = require("./colors");
```

Add these functions above `module.exports`:

```js
// Question/answer form; prefilled when editing an existing FAQ
function faqModal(customId, title, faq) {
    const question = new TextInputBuilder()
        .setCustomId("question").setLabel("Question").setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(true);
    const answer = new TextInputBuilder()
        .setCustomId("answer").setLabel("Answer").setStyle(TextInputStyle.Paragraph).setMaxLength(4000).setRequired(true);
    if (faq) {
        question.setValue(faq.question);
        answer.setValue(faq.answer);
    }
    return new ModalBuilder().setCustomId(customId).setTitle(title).addComponents(
        new ActionRowBuilder().addComponents(question),
        new ActionRowBuilder().addComponents(answer),
    );
}

// The public FAQ panel; its menu ("faq:select") is handled by commands/faq.js
function faqPanel(faqs) {
    const shown = faqs.slice(0, 25);
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle("❓ Frequently Asked Questions")
        .setDescription("Pick a question from the menu below to see the answer.\n\n" + shown.map(f => `• ${f.question}`).join("\n"));
    const menu = new StringSelectMenuBuilder()
        .setCustomId("faq:select")
        .setPlaceholder("Choose a question…")
        .addOptions(shown.map(f => ({ label: f.question.slice(0, 100), value: String(f.id) })));
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}
```

Change the export to:

```js
module.exports = { getFaqs, findFaq, addFaq, updateFaq, removeFaq, faqChoices, faqModal, faqPanel };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test`
Expected: PASS, 18 tests.

- [ ] **Step 5: Use the helpers in the commands**

`commands/selfroles.js`:

- Change the discord.js import to `const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');`.
- Replace `const { EMBED_COLOR } = require('../lib/colors');` with `const { MAX_SELF_ROLES, buildSelfRolePanel } = require('../lib/selfRoles');`.
- Delete `const MAX_ROLES = 10;` and replace both uses of `MAX_ROLES` with `MAX_SELF_ROLES`.
- In `execute`, replace everything from `const embed = new EmbedBuilder()` through the `for` loop that builds `rows` with:

```js
    const panel = buildSelfRolePanel(interaction.options.getString('title'), interaction.options.getString('description'), roles);
```

- Change `await interaction.channel.send({ embeds: [embed], components: rows });` to `await interaction.channel.send(panel);`.

`commands/faqmanage.js`:

- Delete the local `faqModal` function.
- Change the lib import to `const { getFaqs, findFaq, addFaq, updateFaq, removeFaq, faqChoices, faqModal, faqPanel } = require('../lib/faq');`.
- In the panel branch, delete the `embed` and `menu` constants, and change the send to `await channel.send(faqPanel(faqs));`.
- Change the discord.js import to `const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');` and delete `const { EMBED_COLOR } = require('../lib/colors');`.

- [ ] **Step 6: Verify nothing references removed names and tests pass**

Run: `grep -n "EmbedBuilder\|ButtonBuilder\|MAX_ROLES\|EMBED_COLOR" commands/selfroles.js; grep -n "EmbedBuilder\|StringSelectMenuBuilder\|ModalBuilder\|TextInput\|EMBED_COLOR\|ActionRowBuilder" commands/faqmanage.js; bun -e "for (const f of ['selfroles','faqmanage']) require('./commands/'+f).data.toJSON(); console.log('ok')" && bun test`
Expected: no grep output, `ok`, then PASS, 18 tests.

- [ ] **Step 7: Commit**

```bash
git add lib/selfRoles.js lib/faq.js commands/selfroles.js commands/faqmanage.js test/selfRoles.test.js test/faqHelpers.test.js
git commit -m "Move self-role panel and FAQ form/panel builders into lib"
```

---

### Task 5: Dashboard framework, Home view and Logs section

**Files:**
- Create: `lib/setup/ui.js`, `lib/setup/sections/index.js`, `lib/setup/sections/logs.js`, `commands/setup.js`
- Test: `test/setup.test.js`, `test/setupViews.test.js`

**Interfaces:**
- Consumes: `missingChannelPermissions`, `SEND_EMBED_PERMISSIONS`, `permissionNames`, `listText` (Task 2), fakes (Task 2), and `addFaq` from `lib/faq.js`.
- Produces:
  - `lib/setup/ui.js` → `HOME_ID`, `button(customId, label, style?)`, `toggleButton(customId, label, on)`, `buttonRow(...buttons)`, `channelPicker(customId, selectedId, { placeholder, types }?)`, `rolePicker(customId, selectedIds, { placeholder, max }?)`, `sectionView(section, description, components, notice?)`, `channelText(id)`, `roleText(id)`, `pickedChannel(interaction)`, `CHANNEL_GONE`, `TEXT_CHANNELS`.
  - A section is `{ id, label, emoji, permission, status(config, guild): string, view(interaction, notice?, ...extra): payload, handleComponent(interaction, action, arg), handleModal?(interaction, action, arg) }`. Handlers answer the interaction with `update`, `reply` or `showModal`. If an action is unrecognised they return without answering, and the router replies out-of-date.
  - `lib/setup/sections/index.js` → `{ SECTIONS }`. Later tasks add sections to this array.
  - `commands/setup.js` → command module plus `homeView(interaction, notice?)`.

- [ ] **Step 1: Write the failing tests**

`test/setup.test.js`:

```js
const { describe, test, expect } = require("bun:test");
const { PermissionFlagsBits: P, MessageFlags } = require("discord.js");
const setup = require("../commands/setup");
const { getGuildConfig, updateGuildConfig } = require("../lib/guildConfig");
const { fakeGuild, fakeChannel, fakeInteraction } = require("./fakes");

const OUT_OF_DATE = "⚠️ This dashboard is out of date. Run /setup again.";
const reply = interaction => interaction.reply.mock.calls[0][0];
const update = interaction => interaction.update.mock.calls[0][0];

describe("/setup", () => {
    test("opens the home view privately", async () => {
        const interaction = fakeInteraction();
        await setup.execute(interaction);
        expect(reply(interaction).flags).toBe(MessageFlags.Ephemeral);
        expect(reply(interaction).embeds[0].toJSON().title).toBe("⚙️ Test Server setup");
        expect(reply(interaction).embeds[0].toJSON().footer.text).toBe("Only you can see this. Changes save immediately.");
    });

    test("refuses members who can't open any section", async () => {
        const interaction = fakeInteraction({ permissions: P.SendMessages });
        await setup.execute(interaction);
        expect(reply(interaction).content).toBe("❌ You don't have permission to change any settings.");
    });
});

describe("routing", () => {
    test("the home menu opens a section", async () => {
        const interaction = fakeInteraction({ customId: "setup:home:open", values: ["logs"] });
        await setup.handleComponent(interaction);
        expect(update(interaction).embeds[0].toJSON().title).toBe("📜 Logs");
    });

    test("◀ Home goes back to the home view", async () => {
        const interaction = fakeInteraction({ customId: "setup:home:show" });
        await setup.handleComponent(interaction);
        expect(update(interaction).embeds[0].toJSON().title).toBe("⚙️ Test Server setup");
    });

    test("clicks re-check the section's permission", async () => {
        const interaction = fakeInteraction({ permissions: P.SendMessages, customId: "setup:logs:disable" });
        await setup.handleComponent(interaction);
        expect(reply(interaction).content).toBe("❌ You need **Manage Server** for this.");
    });

    test("unknown sections and actions say the dashboard is out of date", async () => {
        for (const customId of ["setup:nope:x", "setup:logs:nope", "setup:home:nope"]) {
            const interaction = fakeInteraction({ customId });
            await setup.handleComponent(interaction);
            expect(reply(interaction).content).toBe(OUT_OF_DATE);
        }
    });
});

describe("logs section", () => {
    test("picking a channel saves it", async () => {
        const channel = fakeChannel();
        const guild = fakeGuild({ channels: [channel] });
        const interaction = fakeInteraction({ guild, customId: "setup:logs:channel", values: [channel.id] });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(guild.id).logChannelId).toBe(channel.id);
        expect(update(interaction).content).toBe(`✅ Logs will be sent to <#${channel.id}>.`);
    });

    test("a channel the bot can't post in is refused", async () => {
        const channel = fakeChannel(undefined, P.ViewChannel);
        const guild = fakeGuild({ channels: [channel] });
        const interaction = fakeInteraction({ guild, customId: "setup:logs:channel", values: [channel.id] });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(guild.id).logChannelId).toBeUndefined();
        expect(update(interaction).content).toStartWith("❌ I need View Channel");
    });

    test("a channel that no longer exists is refused", async () => {
        const interaction = fakeInteraction({ customId: "setup:logs:channel", values: ["deleted"] });
        await setup.handleComponent(interaction);
        expect(update(interaction).content).toBe("❌ I can't see that channel.");
    });

    test("disable clears the channel", async () => {
        const interaction = fakeInteraction({ customId: "setup:logs:disable" });
        updateGuildConfig(interaction.guild.id, { logChannelId: "c1" });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(interaction.guild.id).logChannelId).toBeUndefined();
        expect(update(interaction).content).toBe("✅ Logging disabled.");
    });
});
```

`test/setupViews.test.js`:

```js
const { describe, test, expect } = require("bun:test");
const setup = require("../commands/setup");
const { SECTIONS } = require("../lib/setup/sections");
const { updateGuildConfig } = require("../lib/guildConfig");
const { addFaq } = require("../lib/faq");
const { fakeGuild, fakeInteraction } = require("./fakes");

const FILLED = {
    welcomeChannelId: "c1", welcomeMessage: "Hi {user}", goodbyeChannelId: "c2", goodbyeMessage: "Bye {username}",
    logChannelId: "c3", automodInvites: true, automodLinks: true, automodSpam: true, automodMentionLimit: 5,
    automodMinAccountAgeDays: 7, honeypotChannelId: "c4", honeypotAction: "ban", autoRoleId: "r1", botAutoRoleId: "r2",
    restoreRoles: true,
};

// Every setting on, plus more (and longer) FAQs than a menu can hold
function filledInteraction() {
    const interaction = fakeInteraction();
    updateGuildConfig(interaction.guild.id, FILLED);
    for (let i = 0; i < 30; i++) addFaq(interaction.guild.id, `Question ${i} ${"x".repeat(180)}`, "Answer");
    return interaction;
}

const SETTINGS = [["empty", () => fakeInteraction()], ["filled", filledInteraction]];
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
            if (component.options) expect(component.options.length).toBeLessThanOrEqual(25);
            for (const option of component.options ?? []) expect(option.label.length).toBeLessThanOrEqual(100);
        }
    }
}

// Every "setup:" id a view produces must reach a section handler
function expectRoutable(payload) {
    for (const row of rowsOf(payload)) {
        for (const { custom_id } of row.components) {
            const [prefix, sectionId] = custom_id.split(":");
            if (prefix !== "setup" || sectionId === "home") continue;
            expect(SECTIONS.find(s => s.id === sectionId)?.handleComponent).toBeFunction();
        }
    }
}

describe("home view", () => {
    for (const [name, make] of SETTINGS) {
        test(`is valid with ${name} settings`, () => {
            const payload = setup.homeView(make());
            expectWithinDiscordLimits(payload);
            expect(rowsOf(payload)[0].components[0].options.map(o => o.value)).toEqual(SECTIONS.map(s => s.id));
        });
    }
});

for (const section of SECTIONS) {
    describe(`${section.label} view`, () => {
        for (const [name, make] of SETTINGS) {
            test(`is valid with ${name} settings`, () => {
                const payload = section.view(make());
                expectWithinDiscordLimits(payload);
                expectRoutable(payload);
                expect(rowsOf(payload).at(-1).components.at(-1).custom_id).toBe("setup:home:show");
            });
        }

        test("has a status line", () => {
            expect(section.status({}, fakeGuild()).length).toBeGreaterThan(0);
        });
    });
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/setup.test.js test/setupViews.test.js`
Expected: FAIL with `Cannot find module '../commands/setup'`.

- [ ] **Step 3: Implement `lib/setup/ui.js`**

```js
const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ChannelType, EmbedBuilder,
} = require("discord.js");
const { EMBED_COLOR } = require("../colors");

const HOME_ID = "setup:home:show";
const TEXT_CHANNELS = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const CHANNEL_GONE = "❌ I can't see that channel.";

function button(customId, label, style = ButtonStyle.Secondary) {
    return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

// Green when on, grey when off; clicking it flips the setting
function toggleButton(customId, label, on) {
    return button(customId, `${label}: ${on ? "on" : "off"}`, on ? ButtonStyle.Success : ButtonStyle.Secondary);
}

// A section's last row: up to 4 of its own buttons, then ◀ Home
function buttonRow(...buttons) {
    return new ActionRowBuilder().addComponents(...buttons, button(HOME_ID, "◀ Home"));
}

function channelPicker(customId, selectedId, { placeholder = "Pick a channel…", types = TEXT_CHANNELS } = {}) {
    const menu = new ChannelSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).setChannelTypes(...types);
    if (selectedId) menu.setDefaultChannels([selectedId]);
    return new ActionRowBuilder().addComponents(menu);
}

function rolePicker(customId, selectedIds = [], { placeholder = "Pick a role…", max = 1 } = {}) {
    const menu = new RoleSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).setMaxValues(max);
    if (selectedIds.length) menu.setDefaultRoles(selectedIds);
    return new ActionRowBuilder().addComponents(menu);
}

// A full update payload for a section; `notice` is a result or error line shown above the embed
function sectionView(section, description, components, notice) {
    const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTitle(`${section.emoji} ${section.label}`).setDescription(description);
    return { content: notice ?? "", embeds: [embed], components };
}

const channelText = id => (id ? `<#${id}>` : "*not set*");
const roleText = id => (id ? `<@&${id}>` : "*not set*");

// The channel picked in a channel menu, from the server's cache (undefined if it was deleted)
const pickedChannel = interaction => interaction.guild.channels.cache.get(interaction.values[0]);

module.exports = {
    HOME_ID, TEXT_CHANNELS, CHANNEL_GONE,
    button, toggleButton, buttonRow, channelPicker, rolePicker, sectionView, channelText, roleText, pickedChannel,
};
```

- [ ] **Step 4: Implement `lib/setup/sections/logs.js`**

```js
const { PermissionFlagsBits, ButtonStyle, ChannelType } = require("discord.js");
const { getGuildConfig, updateGuildConfig } = require("../../guildConfig");
const { missingChannelPermissions, SEND_EMBED_PERMISSIONS } = require("../../channelChecks");
const { sectionView, channelPicker, buttonRow, button, channelText, pickedChannel, CHANNEL_GONE } = require("../ui");

const section = {
    id: "logs",
    label: "Logs",
    emoji: "📜",
    permission: PermissionFlagsBits.ManageGuild,

    status: config => (config.logChannelId ? `on · <#${config.logChannelId}>` : "off"),

    view(interaction, notice) {
        const { logChannelId } = getGuildConfig(interaction.guild.id);
        const lines = [
            "Logs server activity (messages, members, moderation, voice) to a channel.",
            "",
            `**Channel:** ${channelText(logChannelId)}`,
        ];
        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
            lines.push("", "⚠️ Give me **View Audit Log** so logs can show who banned/kicked/timed out someone.");
        }
        return sectionView(section, lines.join("\n"), [
            channelPicker("setup:logs:channel", logChannelId, { placeholder: "Pick the log channel…", types: [ChannelType.GuildText] }),
            buttonRow(button("setup:logs:disable", "Disable", ButtonStyle.Danger).setDisabled(!logChannelId)),
        ], notice);
    },

    async handleComponent(interaction, action) {
        const { guild } = interaction;
        if (action === "channel") {
            const channel = pickedChannel(interaction);
            const error = channel ? missingChannelPermissions(channel, guild.members.me, SEND_EMBED_PERMISSIONS) : CHANNEL_GONE;
            if (!error) updateGuildConfig(guild.id, { logChannelId: channel.id });
            return interaction.update(section.view(interaction, error ?? `✅ Logs will be sent to ${channel}.`));
        }
        if (action === "disable") {
            updateGuildConfig(guild.id, { logChannelId: null });
            return interaction.update(section.view(interaction, "✅ Logging disabled."));
        }
    },
};

module.exports = section;
```

`lib/setup/sections/index.js`:

```js
// Order shown on the /setup home page. A new feature gets its own file here and a line below.
const SECTIONS = [
    require("./logs"),
];

module.exports = { SECTIONS };
```

- [ ] **Step 5: Implement `commands/setup.js`**

```js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { EMBED_COLOR } = require('../lib/colors');
const { getGuildConfig } = require('../lib/guildConfig');
const { permissionNames, listText } = require('../lib/permissions');
const { SECTIONS } = require('../lib/setup/sections');

const OUT_OF_DATE = { content: '⚠️ This dashboard is out of date. Run /setup again.', flags: MessageFlags.Ephemeral };

const canOpen = (section, interaction) => !!interaction.memberPermissions?.has(section.permission);
const visibleSections = interaction => SECTIONS.filter(section => canOpen(section, interaction));

const permissionReply = section => ({
  content: `❌ You need **${listText(permissionNames(section.permission))}** for this.`,
  flags: MessageFlags.Ephemeral,
});

function homeView(interaction, notice) {
  const { guild } = interaction;
  const config = getGuildConfig(guild.id);
  const sections = visibleSections(interaction);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`⚙️ ${guild.name} setup`)
    .setThumbnail(guild.iconURL())
    .addFields(sections.map(s => ({ name: `${s.emoji} ${s.label}`, value: s.status(config, guild), inline: true })))
    .setFooter({ text: 'Only you can see this. Changes save immediately.' });
  const menu = new StringSelectMenuBuilder()
    .setCustomId('setup:home:open')
    .setPlaceholder('Open a section…')
    .addOptions(sections.map(s => ({ label: s.label, emoji: { name: s.emoji }, value: s.id })));
  return { content: notice ?? '', embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

// Buttons, menus and forms use "setup:<section>:<action>[:<arg>]"
async function route(interaction, kind) {
  const [, sectionId, action, arg] = interaction.customId.split(':');

  if (sectionId === 'home') {
    if (action === 'show') return interaction.update(homeView(interaction));
    if (action !== 'open') return interaction.reply(OUT_OF_DATE);
    const section = SECTIONS.find(s => s.id === interaction.values[0]);
    if (!section) return interaction.reply(OUT_OF_DATE);
    if (!canOpen(section, interaction)) return interaction.reply(permissionReply(section));
    return interaction.update(section.view(interaction));
  }

  const section = SECTIONS.find(s => s.id === sectionId);
  const handler = kind === 'modal' ? section?.handleModal : section?.handleComponent;
  if (!handler) return interaction.reply(OUT_OF_DATE);
  // The dashboard is private, but permissions can change while it's open
  if (!canOpen(section, interaction)) return interaction.reply(permissionReply(section));
  await handler(interaction, action, arg);
  // A handler that didn't recognise the action left the interaction unanswered
  if (!interaction.replied && !interaction.deferred) await interaction.reply(OUT_OF_DATE);
}

module.exports = {
  category: 'setup',
  homeView,
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Open the settings dashboard for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    if (!visibleSections(interaction).length) {
      return interaction.reply({ content: "❌ You don't have permission to change any settings.", flags: MessageFlags.Ephemeral });
    }
    await interaction.reply({ ...homeView(interaction), flags: MessageFlags.Ephemeral });
  },

  handleComponent(interaction) {
    return route(interaction, 'component');
  },

  handleModal(interaction) {
    return route(interaction, 'modal');
  },
};
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test`
Expected: PASS, 18 + 10 (`setup.test.js`) + 5 (`setupViews.test.js`) = 33 tests.

- [ ] **Step 7: Commit**

```bash
git add lib/setup commands/setup.js test/setup.test.js test/setupViews.test.js
git commit -m "Add /setup dashboard with home view and logs section"
```

---

### Task 6: Welcome and Goodbye sections

**Files:**
- Create: `lib/setup/sections/greeting.js`, `lib/setup/sections/welcome.js`, `lib/setup/sections/goodbye.js`
- Modify: `lib/setup/sections/index.js`
- Test: `test/setupGreeting.test.js`

**Interfaces:**
- Consumes: the `lib/setup/ui.js` helpers and section shape (Task 5), `missingChannelPermissions`/`SEND_EMBED_PERMISSIONS` (Task 2), and `DEFAULT_WELCOME`, `DEFAULT_GOODBYE`, `PLACEHOLDERS`, `buildGreetingEmbed` from `lib/greetings.js`.
- Produces: `greetingSection({ id, label, emoji, joining, defaultMessage })` returns a section that uses config keys `<id>ChannelId` and `<id>Message`.

- [ ] **Step 1: Write the failing tests**

`test/setupGreeting.test.js`:

```js
const { test, expect } = require("bun:test");
const setup = require("../commands/setup");
const { getGuildConfig, updateGuildConfig } = require("../lib/guildConfig");
const { fakeGuild, fakeChannel, fakeInteraction } = require("./fakes");

const update = interaction => interaction.update.mock.calls[0][0];

test("picking a channel turns welcome on and keeps the message", async () => {
    const channel = fakeChannel();
    const guild = fakeGuild({ channels: [channel] });
    updateGuildConfig(guild.id, { welcomeMessage: "Hi {user}" });
    const interaction = fakeInteraction({ guild, customId: "setup:welcome:channel", values: [channel.id] });
    await setup.handleComponent(interaction);
    expect(getGuildConfig(guild.id)).toMatchObject({ welcomeChannelId: channel.id, welcomeMessage: "Hi {user}" });
    expect(update(interaction).content).toBe(`✅ Welcome messages will be sent in <#${channel.id}>.`);
});

test("Edit message opens a prefilled form", async () => {
    const interaction = fakeInteraction({ customId: "setup:welcome:message" });
    updateGuildConfig(interaction.guild.id, { welcomeMessage: "Hi {user}" });
    await setup.handleComponent(interaction);
    const modal = interaction.showModal.mock.calls[0][0].toJSON();
    expect(modal.custom_id).toBe("setup:welcome:message");
    expect(modal.components[0].components[0].value).toBe("Hi {user}");
});

test("saving a message without a channel says to pick one", async () => {
    const interaction = fakeInteraction({ customId: "setup:welcome:message", fields: { message: "Hello {user}" } });
    await setup.handleModal(interaction);
    expect(getGuildConfig(interaction.guild.id).welcomeMessage).toBe("Hello {user}");
    expect(update(interaction).content).toBe("✅ Message saved. Pick a channel to turn it on.");
});

test("an empty message goes back to the default", async () => {
    const interaction = fakeInteraction({ customId: "setup:welcome:message", fields: { message: "   " } });
    updateGuildConfig(interaction.guild.id, { welcomeChannelId: "c1", welcomeMessage: "Old" });
    await setup.handleModal(interaction);
    expect(getGuildConfig(interaction.guild.id).welcomeMessage).toBeUndefined();
    expect(update(interaction).content).toBe("✅ Message saved.");
});

test("disable clears the channel and message", async () => {
    const interaction = fakeInteraction({ customId: "setup:welcome:disable" });
    updateGuildConfig(interaction.guild.id, { welcomeChannelId: "c1", welcomeMessage: "Hi" });
    await setup.handleComponent(interaction);
    expect(getGuildConfig(interaction.guild.id).welcomeChannelId).toBeUndefined();
    expect(getGuildConfig(interaction.guild.id).welcomeMessage).toBeUndefined();
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
Expected: FAIL. Every test gets the out-of-date reply because `welcome`/`goodbye` aren't sections yet, so `interaction.update.mock.calls[0]` is undefined or the config is unchanged.

- [ ] **Step 3: Implement**

`lib/setup/sections/greeting.js`:

```js
const {
    PermissionFlagsBits, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require("discord.js");
const { getGuildConfig, updateGuildConfig } = require("../../guildConfig");
const { missingChannelPermissions, SEND_EMBED_PERMISSIONS } = require("../../channelChecks");
const { PLACEHOLDERS, buildGreetingEmbed } = require("../../greetings");
const { sectionView, channelPicker, buttonRow, button, channelText, pickedChannel, CHANNEL_GONE } = require("../ui");

// Welcome and goodbye work the same way and only differ in their settings keys and wording
function greetingSection({ id, label, emoji, joining, defaultMessage }) {
    const channelKey = `${id}ChannelId`;
    const messageKey = `${id}Message`;

    const section = {
        id,
        label,
        emoji,
        permission: PermissionFlagsBits.ManageGuild,

        status: config => (config[channelKey] ? `on · <#${config[channelKey]}>` : "off"),

        view(interaction, notice) {
            const config = getGuildConfig(interaction.guild.id);
            const description = [
                `**Channel:** ${channelText(config[channelKey])}`,
                `**Message:** ${config[messageKey] || `*default:* ${defaultMessage}`}`,
                "",
                `Placeholders: ${PLACEHOLDERS}`,
            ].join("\n");
            return sectionView(section, description, [
                channelPicker(`setup:${id}:channel`, config[channelKey], { placeholder: `Pick the ${id} channel…` }),
                buttonRow(
                    button(`setup:${id}:message`, "✏️ Edit message"),
                    button(`setup:${id}:preview`, "👁️ Preview"),
                    button(`setup:${id}:disable`, "Disable", ButtonStyle.Danger).setDisabled(!config[channelKey]),
                ),
            ], notice);
        },

        async handleComponent(interaction, action) {
            const { guild } = interaction;
            const config = getGuildConfig(guild.id);

            if (action === "channel") {
                const channel = pickedChannel(interaction);
                const error = channel ? missingChannelPermissions(channel, guild.members.me, SEND_EMBED_PERMISSIONS) : CHANNEL_GONE;
                if (!error) updateGuildConfig(guild.id, { [channelKey]: channel.id });
                return interaction.update(section.view(interaction, error ?? `✅ ${label} messages will be sent in ${channel}.`));
            }
            if (action === "message") {
                const input = new TextInputBuilder()
                    .setCustomId("message")
                    .setLabel("Message (leave empty for the default)")
                    .setStyle(TextInputStyle.Paragraph)
                    .setMaxLength(1000)
                    .setRequired(false)
                    .setPlaceholder(defaultMessage.slice(0, 100));
                if (config[messageKey]) input.setValue(config[messageKey]);
                return interaction.showModal(new ModalBuilder()
                    .setCustomId(`setup:${id}:message`)
                    .setTitle(`${label} message`)
                    .addComponents(new ActionRowBuilder().addComponents(input)));
            }
            if (action === "preview") {
                // Shown with the person clicking standing in for the member
                return interaction.reply({
                    embeds: [buildGreetingEmbed(interaction.member, config[messageKey] || defaultMessage, joining)],
                    flags: MessageFlags.Ephemeral,
                });
            }
            if (action === "disable") {
                updateGuildConfig(guild.id, { [channelKey]: null, [messageKey]: null });
                return interaction.update(section.view(interaction, `✅ ${label} messages disabled.`));
            }
        },

        async handleModal(interaction, action) {
            if (action !== "message") return;
            const message = interaction.fields.getTextInputValue("message").trim() || null;
            const updated = updateGuildConfig(interaction.guild.id, { [messageKey]: message });
            const notice = updated[channelKey] ? "✅ Message saved." : "✅ Message saved. Pick a channel to turn it on.";
            return interaction.update(section.view(interaction, notice));
        },
    };
    return section;
}

module.exports = { greetingSection };
```

`lib/setup/sections/welcome.js`:

```js
const { DEFAULT_WELCOME } = require("../../greetings");
const { greetingSection } = require("./greeting");

module.exports = greetingSection({ id: "welcome", label: "Welcome", emoji: "📢", joining: true, defaultMessage: DEFAULT_WELCOME });
```

`lib/setup/sections/goodbye.js`:

```js
const { DEFAULT_GOODBYE } = require("../../greetings");
const { greetingSection } = require("./greeting");

module.exports = greetingSection({ id: "goodbye", label: "Goodbye", emoji: "👋", joining: false, defaultMessage: DEFAULT_GOODBYE });
```

In `lib/setup/sections/index.js`, set the array to:

```js
const SECTIONS = [
    require("./welcome"),
    require("./goodbye"),
    require("./logs"),
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test`
Expected: PASS. That is the 33 earlier tests, 6 new greeting tests, and 2 × 3 = 6 new generic view tests (welcome and goodbye) = 45 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/setup/sections test/setupGreeting.test.js
git commit -m "Add welcome and goodbye sections to /setup"
```

---

### Task 7: Honeypot and Automod sections

**Files:**
- Create: `lib/setup/sections/honeypot.js`, `lib/setup/sections/automod.js`
- Modify: `lib/setup/sections/index.js`
- Test: `test/setupHoneypotAutomod.test.js`

**Interfaces:**
- Consumes: the `ui.js` helpers (Task 5) and `ACTION_LABELS`, `honeypotError`, `honeypotWarningEmbed` (Task 3).
- Produces: sections `honeypot` (permission Administrator) and `automod` (permission ManageGuild).

- [ ] **Step 1: Write the failing tests**

`test/setupHoneypotAutomod.test.js`:

```js
const { describe, test, expect } = require("bun:test");
const { PermissionFlagsBits: P } = require("discord.js");
const setup = require("../commands/setup");
const { getGuildConfig, updateGuildConfig } = require("../lib/guildConfig");
const { fakeGuild, fakeChannel, fakeInteraction } = require("./fakes");

const update = interaction => interaction.update.mock.calls[0][0];

describe("honeypot section", () => {
    test("is hidden from members without Administrator", () => {
        const payload = setup.homeView(fakeInteraction({ permissions: P.ManageGuild }));
        const ids = payload.components[0].toJSON().components[0].options.map(o => o.value);
        expect(ids).toContain("logs");
        expect(ids).not.toContain("honeypot");
    });

    test("picking a channel turns it on with soft ban", async () => {
        const channel = fakeChannel();
        const guild = fakeGuild({ channels: [channel] });
        const interaction = fakeInteraction({ guild, customId: "setup:honeypot:channel", values: [channel.id] });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(guild.id)).toMatchObject({ honeypotChannelId: channel.id, honeypotAction: "softban" });
    });

    test("picking a channel without Ban Members is refused", async () => {
        const channel = fakeChannel();
        const guild = fakeGuild({ botPermissions: P.KickMembers, channels: [channel] });
        const interaction = fakeInteraction({ guild, customId: "setup:honeypot:channel", values: [channel.id] });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(guild.id).honeypotChannelId).toBeUndefined();
        expect(update(interaction).content).toBe("❌ I need the **Ban Members** permission for this.");
    });

    test("changing the action is saved", async () => {
        const interaction = fakeInteraction({ customId: "setup:honeypot:action", values: ["kick"] });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(interaction.guild.id).honeypotAction).toBe("kick");
    });

    test("Post warning sends the warning to the honeypot channel", async () => {
        const channel = fakeChannel();
        const guild = fakeGuild({ channels: [channel] });
        updateGuildConfig(guild.id, { honeypotChannelId: channel.id, honeypotAction: "ban" });
        const interaction = fakeInteraction({ guild, customId: "setup:honeypot:warning" });
        await setup.handleComponent(interaction);
        expect(channel.send.mock.calls[0][0].embeds[0].toJSON().description).toContain("automatically banned");
        expect(update(interaction).content).toBe(`✅ Warning posted in <#${channel.id}>.`);
    });
});

describe("automod section", () => {
    test("toggles flip a rule on and off", async () => {
        const guild = fakeGuild();
        await setup.handleComponent(fakeInteraction({ guild, customId: "setup:automod:toggle:invites" }));
        expect(getGuildConfig(guild.id).automodInvites).toBe(true);
        await setup.handleComponent(fakeInteraction({ guild, customId: "setup:automod:toggle:invites" }));
        expect(getGuildConfig(guild.id).automodInvites).toBeUndefined();
    });

    test("the limits form saves both numbers", async () => {
        const interaction = fakeInteraction({ customId: "setup:automod:limits", fields: { mentions: "5", age: "7" } });
        await setup.handleModal(interaction);
        expect(getGuildConfig(interaction.guild.id)).toMatchObject({ automodMentionLimit: 5, automodMinAccountAgeDays: 7 });
        expect(update(interaction).content).toBe("✅ Limits saved.");
    });

    test("invalid limits are refused", async () => {
        const interaction = fakeInteraction({ customId: "setup:automod:limits", fields: { mentions: "abc", age: "400" } });
        await setup.handleModal(interaction);
        expect(getGuildConfig(interaction.guild.id).automodMentionLimit).toBeUndefined();
        expect(update(interaction).content).toBe("❌ Use whole numbers: mentions 0–50, account age 0–365.");
    });

    test("the account age rule needs Kick Members", async () => {
        const guild = fakeGuild({ botPermissions: P.BanMembers });
        const interaction = fakeInteraction({ guild, customId: "setup:automod:limits", fields: { mentions: "0", age: "3" } });
        await setup.handleModal(interaction);
        expect(getGuildConfig(guild.id).automodMinAccountAgeDays).toBeUndefined();
        expect(update(interaction).content).toBe("❌ I need the **Kick Members** permission for the account age rule.");
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/setupHoneypotAutomod.test.js`
Expected: FAIL. The honeypot is missing from the home options in the first test, and the handler tests get the out-of-date reply.

Note: the first test expects `honeypot` to be **absent**. It passes before implementation for the wrong reason (the section doesn't exist yet). It must still pass after Step 4. That is the real check.

- [ ] **Step 3: Implement**

`lib/setup/sections/honeypot.js`:

```js
const { PermissionFlagsBits, ButtonStyle, ChannelType, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const { getGuildConfig, updateGuildConfig } = require("../../guildConfig");
const { ACTION_LABELS, honeypotError, honeypotWarningEmbed } = require("../../honeypot");
const { sectionView, channelPicker, buttonRow, button, channelText, pickedChannel, CHANNEL_GONE } = require("../ui");

const section = {
    id: "honeypot",
    label: "Honeypot",
    emoji: "🍯",
    permission: PermissionFlagsBits.Administrator,

    status: config => (config.honeypotChannelId ? `on · <#${config.honeypotChannelId}>` : "off"),

    view(interaction, notice) {
        const config = getGuildConfig(interaction.guild.id);
        const action = config.honeypotAction || "softban";
        const description = [
            "A trap channel: anyone who posts in it is removed. Staff with **Manage Messages** are ignored.",
            "💡 Put it near the top of the channel list; spam bots usually post in the first channels they see.",
            "",
            `**Channel:** ${channelText(config.honeypotChannelId)}`,
            `**Action:** ${ACTION_LABELS[action]}`,
        ].join("\n");
        const actionMenu = new StringSelectMenuBuilder()
            .setCustomId("setup:honeypot:action")
            .addOptions(Object.entries(ACTION_LABELS).map(([value, label]) => ({ label, value, default: value === action })));
        return sectionView(section, description, [
            channelPicker("setup:honeypot:channel", config.honeypotChannelId, { placeholder: "Pick the trap channel…", types: [ChannelType.GuildText] }),
            new ActionRowBuilder().addComponents(actionMenu),
            buttonRow(
                button("setup:honeypot:warning", "⚠️ Post warning").setDisabled(!config.honeypotChannelId),
                button("setup:honeypot:disable", "Disable", ButtonStyle.Danger).setDisabled(!config.honeypotChannelId),
            ),
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
                error ?? `🍯 Honeypot active in ${channel}. Use **Post warning** so members know not to type there.`));
        }
        if (action === "action") {
            const chosen = interaction.values[0];
            const channel = config.honeypotChannelId && guild.channels.cache.get(config.honeypotChannelId);
            const error = channel ? honeypotError(guild, channel, chosen) : null;
            if (!error) updateGuildConfig(guild.id, { honeypotAction: chosen });
            return interaction.update(section.view(interaction, error ?? `✅ Action: **${ACTION_LABELS[chosen]}**`));
        }
        if (action === "warning") {
            const channel = guild.channels.cache.get(config.honeypotChannelId);
            const sent = channel && await channel.send({ embeds: [honeypotWarningEmbed(current)] }).then(() => true, () => false);
            return interaction.update(section.view(interaction,
                sent ? `✅ Warning posted in ${channel}.` : "❌ I couldn't post in the honeypot channel."));
        }
        if (action === "disable") {
            updateGuildConfig(guild.id, { honeypotChannelId: null, honeypotAction: null });
            return interaction.update(section.view(interaction, "✅ Honeypot disabled."));
        }
    },
};

module.exports = section;
```

`lib/setup/sections/automod.js`:

```js
const { PermissionFlagsBits, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { getGuildConfig, updateGuildConfig } = require("../../guildConfig");
const { sectionView, buttonRow, button, toggleButton } = require("../ui");

// [custom id part, settings key, button label]
const TOGGLES = [["invites", "automodInvites", "Invites"], ["links", "automodLinks", "Links"], ["spam", "automodSpam", "Spam"]];

const onOff = value => (value ? "✅ on" : "❌ off");

// Empty counts as 0; anything else must be a whole number from 0 to max. Returns null if invalid.
function parseLimit(text, max) {
    const value = text.trim() || "0";
    if (!/^\d+$/.test(value)) return null;
    const number = Number(value);
    return number <= max ? number : null;
}

function limitInput(id, label, value) {
    return new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setMaxLength(3).setRequired(false).setValue(String(value ?? 0)));
}

const section = {
    id: "automod",
    label: "Automod",
    emoji: "🛡️",
    permission: PermissionFlagsBits.ManageGuild,

    status(config) {
        const on = TOGGLES.filter(([, key]) => config[key]).length
            + (config.automodMentionLimit ? 1 : 0) + (config.automodMinAccountAgeDays ? 1 : 0);
        return on ? `${on} of 5 rules on` : "off";
    },

    view(interaction, notice) {
        const c = getGuildConfig(interaction.guild.id);
        const description = [
            "Staff with **Manage Messages** are ignored.",
            "",
            `🔗 **Invites:** ${onOff(c.automodInvites)}, deletes invite links to other servers`,
            `🌐 **Links:** ${onOff(c.automodLinks)}, deletes all links`,
            `💬 **Spam:** ${onOff(c.automodSpam)}, times out members who send 5+ messages within 5 seconds`,
            `📣 **Mention limit:** ${c.automodMentionLimit ? `**${c.automodMentionLimit}** per message` : "❌ off"}`,
            `🆕 **Minimum account age:** ${c.automodMinAccountAgeDays ? `**${c.automodMinAccountAgeDays} day(s)**` : "❌ off"}`,
        ].join("\n");
        return sectionView(section, description, [
            new ActionRowBuilder().addComponents(TOGGLES.map(([id, key, label]) => toggleButton(`setup:automod:toggle:${id}`, label, !!c[key]))),
            buttonRow(button("setup:automod:limits", "✏️ Limits")),
        ], notice);
    },

    async handleComponent(interaction, action, arg) {
        const { guild } = interaction;
        const config = getGuildConfig(guild.id);

        if (action === "toggle") {
            const toggle = TOGGLES.find(([id]) => id === arg);
            if (!toggle) return;
            const [, key, label] = toggle;
            updateGuildConfig(guild.id, { [key]: config[key] ? null : true });
            return interaction.update(section.view(interaction, `🛡️ ${label} filter: ${onOff(!config[key])}`));
        }
        if (action === "limits") {
            return interaction.showModal(new ModalBuilder()
                .setCustomId("setup:automod:limits")
                .setTitle("Automod limits")
                .addComponents(
                    limitInput("mentions", "Max mentions per message (0-50, 0 = off)", config.automodMentionLimit),
                    limitInput("age", "Minimum account age in days (0-365, 0 = off)", config.automodMinAccountAgeDays),
                ));
        }
    },

    async handleModal(interaction, action) {
        if (action !== "limits") return;
        const mentions = parseLimit(interaction.fields.getTextInputValue("mentions"), 50);
        const days = parseLimit(interaction.fields.getTextInputValue("age"), 365);
        if (mentions === null || days === null) {
            return interaction.update(section.view(interaction, "❌ Use whole numbers: mentions 0–50, account age 0–365."));
        }
        if (days && !interaction.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) {
            return interaction.update(section.view(interaction, "❌ I need the **Kick Members** permission for the account age rule."));
        }
        updateGuildConfig(interaction.guild.id, { automodMentionLimit: mentions || null, automodMinAccountAgeDays: days || null });
        return interaction.update(section.view(interaction, "✅ Limits saved."));
    },
};

module.exports = section;
```

In `lib/setup/sections/index.js`, set the array to:

```js
const SECTIONS = [
    require("./welcome"),
    require("./goodbye"),
    require("./logs"),
    require("./automod"),
    require("./honeypot"),
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test`
Expected: PASS. That is the 45 earlier tests, 9 new tests, and 6 new generic view tests = 60 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/setup/sections test/setupHoneypotAutomod.test.js
git commit -m "Add honeypot and automod sections to /setup"
```

---

### Task 8: Auto role and Role restore sections

**Files:**
- Create: `lib/setup/sections/autorole.js`, `lib/setup/sections/restoreroles.js`
- Modify: `lib/setup/sections/index.js`
- Test: `test/setupRoles.test.js`

**Interfaces:**
- Consumes: the `ui.js` helpers (Task 5), `checkAssignableRole` from `lib/moderation.js`, and `setRestoreRoles`, `RESTORE_RULES`, `AUTOROLE_NOTE` (Task 3).
- Produces: sections `autorole` (permission ManageRoles) and `restoreroles` (permission ManageGuild).

- [ ] **Step 1: Write the failing tests**

`test/setupRoles.test.js`:

```js
const { describe, test, expect } = require("bun:test");
const { PermissionFlagsBits: P } = require("discord.js");
const setup = require("../commands/setup");
const { getGuildConfig, updateGuildConfig } = require("../lib/guildConfig");
const { fakeGuild, fakeRole, fakeInteraction } = require("./fakes");

const update = interaction => interaction.update.mock.calls[0][0];

describe("auto role section", () => {
    test("picking a member role saves it", async () => {
        const role = fakeRole();
        const guild = fakeGuild({ roles: [role] });
        const interaction = fakeInteraction({ guild, customId: "setup:autorole:members", values: [role.id] });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(guild.id).autoRoleId).toBe(role.id);
        expect(update(interaction).content).toBe(`✅ <@&${role.id}> will now be given to new members.`);
    });

    test("the bot role is saved separately", async () => {
        const role = fakeRole();
        const guild = fakeGuild({ roles: [role] });
        await setup.handleComponent(fakeInteraction({ guild, customId: "setup:autorole:bots", values: [role.id] }));
        expect(getGuildConfig(guild.id).botAutoRoleId).toBe(role.id);
        expect(getGuildConfig(guild.id).autoRoleId).toBeUndefined();
    });

    test("a role above the bot is refused", async () => {
        const role = fakeRole(undefined, { position: 200 });
        const guild = fakeGuild({ roles: [role] });
        const interaction = fakeInteraction({ guild, customId: "setup:autorole:members", values: [role.id] });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(guild.id).autoRoleId).toBeUndefined();
        expect(update(interaction).content).toContain("equal to or above my highest role");
    });

    test("clearing the bot role leaves the member role", async () => {
        const interaction = fakeInteraction({ customId: "setup:autorole:clear:bots" });
        updateGuildConfig(interaction.guild.id, { autoRoleId: "r1", botAutoRoleId: "r2" });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(interaction.guild.id)).toMatchObject({ autoRoleId: "r1" });
        expect(getGuildConfig(interaction.guild.id).botAutoRoleId).toBeUndefined();
    });

    test("is hidden from members without Manage Roles", () => {
        const payload = setup.homeView(fakeInteraction({ permissions: P.ManageGuild }));
        expect(payload.components[0].toJSON().components[0].options.map(o => o.value)).not.toContain("autorole");
    });
});

describe("role restore section", () => {
    test("the toggle enables it and mentions the auto role", async () => {
        const interaction = fakeInteraction({ customId: "setup:restoreroles:toggle" });
        updateGuildConfig(interaction.guild.id, { autoRoleId: "r1" });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(interaction.guild.id).restoreRoles).toBe(true);
        expect(interaction.guild.members.fetch).toHaveBeenCalled();
        expect(update(interaction).content).toContain("Your auto role will still be given");
    });

    test("enabling without Manage Roles shows the error", async () => {
        const guild = fakeGuild({ botPermissions: P.KickMembers });
        const interaction = fakeInteraction({ guild, customId: "setup:restoreroles:toggle" });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(guild.id).restoreRoles).toBeUndefined();
        expect(update(interaction).content).toBe("❌ I need the **Manage Roles** permission for this.");
    });

    test("the toggle turns it off again", async () => {
        const interaction = fakeInteraction({ customId: "setup:restoreroles:toggle" });
        updateGuildConfig(interaction.guild.id, { restoreRoles: true });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(interaction.guild.id).restoreRoles).toBeUndefined();
        expect(update(interaction).content).toBe("✅ Role restore disabled.");
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/setupRoles.test.js`
Expected: FAIL. The handler tests get the out-of-date reply. The "hidden" test passes for the wrong reason until the section exists, and must keep passing after Step 4.

- [ ] **Step 3: Implement**

`lib/setup/sections/autorole.js`:

```js
const { PermissionFlagsBits, ButtonStyle } = require("discord.js");
const { getGuildConfig, updateGuildConfig } = require("../../guildConfig");
const { checkAssignableRole } = require("../../moderation");
const { sectionView, rolePicker, buttonRow, button, roleText } = require("../ui");

// Which picker / clear button changes which setting
const TARGETS = {
    members: { key: "autoRoleId", label: "new members" },
    bots: { key: "botAutoRoleId", label: "new bots" },
};

const section = {
    id: "autorole",
    label: "Auto role",
    emoji: "👤",
    permission: PermissionFlagsBits.ManageRoles,

    status: config => [
        config.autoRoleId && `members <@&${config.autoRoleId}>`,
        config.botAutoRoleId && `bots <@&${config.botAutoRoleId}>`,
    ].filter(Boolean).join(" · ") || "off",

    view(interaction, notice) {
        const c = getGuildConfig(interaction.guild.id);
        const description = [
            "Gives new members (and new bots) a role when they join.",
            "",
            `**Members:** ${roleText(c.autoRoleId)}`,
            `**Bots:** ${roleText(c.botAutoRoleId)}`,
        ].join("\n");
        return sectionView(section, description, [
            rolePicker("setup:autorole:members", c.autoRoleId ? [c.autoRoleId] : [], { placeholder: "Role for new members…" }),
            rolePicker("setup:autorole:bots", c.botAutoRoleId ? [c.botAutoRoleId] : [], { placeholder: "Role for new bots…" }),
            buttonRow(
                button("setup:autorole:clear:members", "Clear members", ButtonStyle.Danger).setDisabled(!c.autoRoleId),
                button("setup:autorole:clear:bots", "Clear bots", ButtonStyle.Danger).setDisabled(!c.botAutoRoleId),
            ),
        ], notice);
    },

    async handleComponent(interaction, action, arg) {
        const { guild } = interaction;

        if (Object.hasOwn(TARGETS, action)) {
            const { key, label } = TARGETS[action];
            const role = guild.roles.cache.get(interaction.values[0]);
            const error = role ? checkAssignableRole(interaction, role) : "❌ I can't find that role.";
            if (!error) updateGuildConfig(guild.id, { [key]: role.id });
            return interaction.update(section.view(interaction, error ?? `✅ ${role} will now be given to ${label}.`));
        }
        if (action === "clear" && Object.hasOwn(TARGETS, arg)) {
            const { key, label } = TARGETS[arg];
            updateGuildConfig(guild.id, { [key]: null });
            return interaction.update(section.view(interaction, `✅ Auto role for ${label} disabled.`));
        }
    },
};

module.exports = section;
```

`lib/setup/sections/restoreroles.js`:

```js
const { PermissionFlagsBits } = require("discord.js");
const { getGuildConfig } = require("../../guildConfig");
const { setRestoreRoles, RESTORE_RULES, AUTOROLE_NOTE } = require("../../restoreRoles");
const { sectionView, buttonRow, toggleButton } = require("../ui");

const section = {
    id: "restoreroles",
    label: "Role restore",
    emoji: "♻️",
    permission: PermissionFlagsBits.ManageGuild,

    status: config => (config.restoreRoles ? "on" : "off"),

    view(interaction, notice) {
        const on = !!getGuildConfig(interaction.guild.id).restoreRoles;
        const description = [
            "Gives members their old roles and nickname back when they leave and rejoin.",
            "",
            `**Status:** ${on ? "✅ on" : "❌ off"}`,
            "",
            RESTORE_RULES,
        ].join("\n");
        return sectionView(section, description, [buttonRow(toggleButton("setup:restoreroles:toggle", "Role restore", on))], notice);
    },

    async handleComponent(interaction, action) {
        if (action !== "toggle") return;
        const config = getGuildConfig(interaction.guild.id);
        const enabled = !config.restoreRoles;
        const error = setRestoreRoles(interaction.guild, enabled);
        const notice = error
            ?? (enabled ? `✅ Role restore enabled.${config.autoRoleId ? `\n${AUTOROLE_NOTE}` : ""}` : "✅ Role restore disabled.");
        return interaction.update(section.view(interaction, notice));
    },
};

module.exports = section;
```

In `lib/setup/sections/index.js`, set the array to:

```js
const SECTIONS = [
    require("./welcome"),
    require("./goodbye"),
    require("./logs"),
    require("./automod"),
    require("./honeypot"),
    require("./autorole"),
    require("./restoreroles"),
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test`
Expected: PASS. That is the 60 earlier tests, 8 new tests, and 6 new generic view tests = 74 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/setup/sections test/setupRoles.test.js
git commit -m "Add auto role and role restore sections to /setup"
```

---

### Task 9: FAQ and Self roles sections

**Files:**
- Create: `lib/setup/sections/faq.js`, `lib/setup/sections/selfroles.js`
- Modify: `lib/setup/sections/index.js`
- Test: `test/setupFaqSelfRoles.test.js`

**Interfaces:**
- Consumes:
  - the `ui.js` helpers (Task 5)
  - `getFaqs`, `findFaq`, `removeFaq`, `faqModal`, `faqPanel` (Task 4 / `lib/faq.js`)
  - `MAX_SELF_ROLES`, `buildSelfRolePanel` (Task 4)
  - `saveDraft`, `getDraft`, `dropDraft`, `EXPIRED` from `lib/preview.js`
  - `checkAssignableRole`
  - `missingChannelPermissions`, `SEND_EMBED_PERMISSIONS` (Task 2)
- Produces:
  - Section `faq` (permission ManageGuild). Its `view(interaction, notice?, selectedId?)` takes a third argument.
  - Section `selfroles` (permission ManageRoles).

- [ ] **Step 1: Write the failing tests**

`test/setupFaqSelfRoles.test.js`:

```js
const { describe, test, expect } = require("bun:test");
const setup = require("../commands/setup");
const { addFaq, getFaqs } = require("../lib/faq");
const { fakeGuild, fakeChannel, fakeRole, fakeInteraction } = require("./fakes");

const update = interaction => interaction.update.mock.calls[0][0];
const lastRow = payload => payload.components.at(-1).toJSON().components;

describe("FAQ section", () => {
    test("picking a question enables Edit and Remove for it", async () => {
        const interaction = fakeInteraction({ customId: "setup:faq:pick" });
        const faq = addFaq(interaction.guild.id, "How?", "Like this.");
        interaction.values = [String(faq.id)];
        await setup.handleComponent(interaction);
        const [, edit, remove] = lastRow(update(interaction));
        expect(edit).toMatchObject({ custom_id: `setup:faq:edit:${faq.id}`, disabled: false });
        expect(remove).toMatchObject({ custom_id: `setup:faq:remove:${faq.id}`, disabled: false });
    });

    test("Remove deletes the question", async () => {
        const guild = fakeGuild();
        const faq = addFaq(guild.id, "How?", "Like this.");
        const interaction = fakeInteraction({ guild, customId: `setup:faq:remove:${faq.id}` });
        await setup.handleComponent(interaction);
        expect(getFaqs(guild.id)).toEqual([]);
        expect(update(interaction).content).toStartWith("🗑️ Removed **How?**.");
    });

    test("Add opens the existing FAQ form", async () => {
        const interaction = fakeInteraction({ customId: "setup:faq:add" });
        await setup.handleComponent(interaction);
        expect(interaction.showModal.mock.calls[0][0].toJSON().custom_id).toBe("faqmanage:add");
    });

    test("Edit opens the form prefilled for that question", async () => {
        const guild = fakeGuild();
        const faq = addFaq(guild.id, "How?", "Like this.");
        const interaction = fakeInteraction({ guild, customId: `setup:faq:edit:${faq.id}` });
        await setup.handleComponent(interaction);
        const modal = interaction.showModal.mock.calls[0][0].toJSON();
        expect(modal.custom_id).toBe(`faqmanage:edit:${faq.id}`);
        expect(modal.components[0].components[0].value).toBe("How?");
    });

    test("posting the panel sends it to the picked channel", async () => {
        const channel = fakeChannel();
        const guild = fakeGuild({ channels: [channel] });
        addFaq(guild.id, "How?", "Like this.");
        const interaction = fakeInteraction({ guild, customId: "setup:faq:panel", values: [channel.id] });
        await setup.handleComponent(interaction);
        expect(channel.send.mock.calls[0][0].components[0].toJSON().components[0].custom_id).toBe("faq:select");
        expect(update(interaction).content).toBe(`✅ FAQ panel posted in <#${channel.id}>.`);
    });

    test("posting the panel with no questions is refused", async () => {
        const channel = fakeChannel();
        const guild = fakeGuild({ channels: [channel] });
        const interaction = fakeInteraction({ guild, customId: "setup:faq:panel", values: [channel.id] });
        await setup.handleComponent(interaction);
        expect(channel.send).not.toHaveBeenCalled();
        expect(update(interaction).content).toBe("❌ Add some questions first.");
    });
});

describe("self roles section", () => {
    test("picked roles go into the form, and submitting posts the panel here", async () => {
        const roles = [fakeRole(), fakeRole()];
        const guild = fakeGuild({ roles });
        const pick = fakeInteraction({ guild, customId: "setup:selfroles:roles", values: roles.map(r => r.id) });
        await setup.handleComponent(pick);
        const customId = pick.showModal.mock.calls[0][0].toJSON().custom_id;
        expect(customId).toStartWith("setup:selfroles:post:");

        const submit = fakeInteraction({ guild, customId, fields: { title: "Pick roles", description: "" } });
        await setup.handleModal(submit);
        const panel = submit.channel.send.mock.calls[0][0];
        expect(panel.components[0].toJSON().components.map(b => b.custom_id)).toEqual(roles.map(r => `selfrole:${r.id}`));
        expect(update(submit).content).toBe("✅ Self-role panel posted.");
    });

    test("roles the bot can't assign are refused before the form", async () => {
        const role = fakeRole(undefined, { position: 200 });
        const guild = fakeGuild({ roles: [role] });
        const interaction = fakeInteraction({ guild, customId: "setup:selfroles:roles", values: [role.id] });
        await setup.handleComponent(interaction);
        expect(interaction.showModal).not.toHaveBeenCalled();
        expect(update(interaction).content).toContain("equal to or above my highest role");
    });

    test("an expired form says so", async () => {
        const interaction = fakeInteraction({ customId: "setup:selfroles:post:gone", fields: { title: "T" } });
        await setup.handleModal(interaction);
        expect(update(interaction).content).toBe("⌛ This preview expired. Run the command again.");
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/setupFaqSelfRoles.test.js`
Expected: FAIL. Every test gets the out-of-date reply because the sections don't exist yet.

- [ ] **Step 3: Implement**

`lib/setup/sections/faq.js`:

```js
const { PermissionFlagsBits, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const { getFaqs, findFaq, removeFaq, faqModal, faqPanel } = require("../../faq");
const { missingChannelPermissions, SEND_EMBED_PERMISSIONS } = require("../../channelChecks");
const { sectionView, channelPicker, buttonRow, button, pickedChannel, CHANNEL_GONE } = require("../ui");

const section = {
    id: "faq",
    label: "FAQ",
    emoji: "❓",
    permission: PermissionFlagsBits.ManageGuild,

    status(config, guild) {
        const count = getFaqs(guild.id).length;
        return count ? `${count} question${count === 1 ? "" : "s"}` : "none yet";
    },

    // `selectedId` is the question picked in the menu, which Edit and Remove act on
    view(interaction, notice, selectedId) {
        const faqs = getFaqs(interaction.guild.id);
        const shown = faqs.slice(0, 25);
        const selected = selectedId ? findFaq(interaction.guild.id, selectedId) : null;

        const lines = [`**${faqs.length}** question(s). Members read them with \`/faq\` or an FAQ panel.`];
        if (shown.length) lines.push("", ...shown.map(f => `• ${f.question.slice(0, 100)}`));
        if (faqs.length > shown.length) lines.push(`…and ${faqs.length - shown.length} more (only the first 25 fit in menus).`);
        if (selected) lines.push("", `**Selected:** ${selected.question}`);

        const components = [];
        if (shown.length) {
            components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
                .setCustomId("setup:faq:pick")
                .setPlaceholder("Pick a question to edit or remove…")
                .addOptions(shown.map(f => ({ label: f.question.slice(0, 100), value: String(f.id), default: f.id === selected?.id })))));
        }
        components.push(
            channelPicker("setup:faq:panel", null, { placeholder: "Post the FAQ panel in…" }),
            buttonRow(
                button("setup:faq:add", "➕ Add", ButtonStyle.Success),
                button(`setup:faq:edit:${selected?.id ?? 0}`, "✏️ Edit").setDisabled(!selected),
                button(`setup:faq:remove:${selected?.id ?? 0}`, "🗑️ Remove", ButtonStyle.Danger).setDisabled(!selected),
            ),
        );
        return sectionView(section, lines.join("\n"), components, notice);
    },

    async handleComponent(interaction, action, arg) {
        const { guild } = interaction;

        if (action === "pick") return interaction.update(section.view(interaction, undefined, interaction.values[0]));
        // The add/edit forms use faqmanage's ids, so saving goes through its existing preview flow
        if (action === "add") return interaction.showModal(faqModal("faqmanage:add", "Add FAQ"));
        if (action === "edit") {
            const faq = findFaq(guild.id, arg);
            if (!faq) return interaction.update(section.view(interaction, "❌ That question no longer exists."));
            return interaction.showModal(faqModal(`faqmanage:edit:${faq.id}`, "Edit FAQ", faq));
        }
        if (action === "remove") {
            const removed = removeFaq(guild.id, arg);
            return interaction.update(section.view(interaction, removed
                ? `🗑️ Removed **${removed.question}**.\nRepost any FAQ panels to update their dropdown.`
                : "❌ That question no longer exists."));
        }
        if (action === "panel") {
            const faqs = getFaqs(guild.id);
            if (!faqs.length) return interaction.update(section.view(interaction, "❌ Add some questions first."));
            const channel = pickedChannel(interaction);
            const error = channel ? missingChannelPermissions(channel, guild.members.me, SEND_EMBED_PERMISSIONS) : CHANNEL_GONE;
            if (error) return interaction.update(section.view(interaction, error));
            const sent = await channel.send(faqPanel(faqs)).then(() => true, () => false);
            const note = faqs.length > 25 ? "\n⚠️ Only the first 25 questions fit in a dropdown." : "";
            return interaction.update(section.view(interaction, sent ? `✅ FAQ panel posted in ${channel}.${note}` : `❌ I couldn't post in ${channel}.`));
        }
    },
};

module.exports = section;
```

`lib/setup/sections/selfroles.js`:

```js
const { PermissionFlagsBits, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { checkAssignableRole } = require("../../moderation");
const { MAX_SELF_ROLES, buildSelfRolePanel } = require("../../selfRoles");
const { saveDraft, getDraft, dropDraft, EXPIRED } = require("../../preview");
const { sectionView, rolePicker, buttonRow } = require("../ui");

const section = {
    id: "selfroles",
    label: "Self roles",
    emoji: "🎭",
    permission: PermissionFlagsBits.ManageRoles,

    status: () => "post a panel",

    view(interaction, notice) {
        const description = [
            "Post a panel of buttons members click to give themselves roles.",
            "",
            `1. Pick up to ${MAX_SELF_ROLES} roles below.`,
            "2. Fill in the title and description.",
            "3. The panel is posted in this channel.",
        ].join("\n");
        return sectionView(section, description, [
            rolePicker("setup:selfroles:roles", [], { placeholder: "Pick the roles…", max: MAX_SELF_ROLES }),
            buttonRow(),
        ], notice);
    },

    async handleComponent(interaction, action) {
        if (action !== "roles") return;
        const roles = interaction.values.map(id => interaction.guild.roles.cache.get(id)).filter(Boolean);
        if (!roles.length) return interaction.update(section.view(interaction, "❌ I can't find those roles."));
        for (const role of roles) {
            const error = checkAssignableRole(interaction, role);
            if (error) return interaction.update(section.view(interaction, error));
        }

        // Ten role ids don't fit in a custom id, so the form carries a draft id instead
        const draftId = saveDraft({ roleIds: roles.map(r => r.id) });
        return interaction.showModal(new ModalBuilder()
            .setCustomId(`setup:selfroles:post:${draftId}`)
            .setTitle("Self-role panel")
            .addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder()
                    .setCustomId("title").setLabel("Title").setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder()
                    .setCustomId("description").setLabel("Text shown above the buttons").setStyle(TextInputStyle.Paragraph)
                    .setMaxLength(1000).setRequired(false)),
            ));
    },

    async handleModal(interaction, action, draftId) {
        if (action !== "post") return;
        const draft = getDraft(draftId);
        if (!draft) return interaction.update(section.view(interaction, EXPIRED.content));
        dropDraft(draftId);

        const roles = draft.roleIds.map(id => interaction.guild.roles.cache.get(id)).filter(Boolean);
        const title = interaction.fields.getTextInputValue("title").trim();
        const description = interaction.fields.getTextInputValue("description").trim() || null;
        const sent = await interaction.channel.send(buildSelfRolePanel(title, description, roles)).then(() => true, () => false);
        return interaction.update(section.view(interaction, sent ? "✅ Self-role panel posted." : "❌ I couldn't post in this channel."));
    },
};

module.exports = section;
```

In `lib/setup/sections/index.js`, set the array to its final order:

```js
const SECTIONS = [
    require("./welcome"),
    require("./goodbye"),
    require("./logs"),
    require("./automod"),
    require("./honeypot"),
    require("./autorole"),
    require("./restoreroles"),
    require("./faq"),
    require("./selfroles"),
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test`
Expected: PASS. That is the 74 earlier tests, 9 new tests, and 6 new generic view tests = 89 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/setup/sections test/setupFaqSelfRoles.test.js
git commit -m "Add FAQ and self roles sections to /setup"
```

---

### Task 10: Deploy and verify in Discord

**Files:** none (manual verification)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing in code.

- [ ] **Step 1: Confirm the command list**

Run: `bun -e "const fs=require('fs');const n=fs.readdirSync('commands').filter(f=>f.endsWith('.js')).map(f=>require('./commands/'+f)).filter(c=>'data' in c&&'execute' in c).map(c=>c.data.toJSON().name);console.log(n.length, n.includes('setup'), n.includes('mod'))"`
Expected: `51 true false`

- [ ] **Step 2: Ask before deploying**

`bun run deploy` replaces the bot's **global** commands on Discord. This removes the previously deployed `/mod`, if it was deployed. Ask the user to confirm before running it, and to restart the bot afterwards.

- [ ] **Step 3: Deploy**

Run: `bun run deploy`
Expected: `Successfully reloaded 51 application (/) commands.`

- [ ] **Step 4: Manual checks in a test server (the user runs these)**

- `/setup` opens privately. Home shows every section's status, and the menu opens each one.
- Welcome:
  - Pick a channel. **Edit message** opens a prefilled form, and saving updates the section in place.
  - **Preview** shows the embed. `/welcome show` reports the same settings.
- Honeypot:
  - Pick a channel and change the action. **Post warning** posts in the channel.
  - `/honeypot show` agrees.
- Automod: toggle a rule. **Limits** opens a form, and saving updates the section. `/automod show` agrees.
- Auto role: pick a role, then **Clear members**.
- Role restore: toggle on, then off.
- FAQ:
  - **Add** opens the form, and Save in the preview adds it. Re-open the section to see the new count.
  - Pick a question, then **Edit** and **Remove**. Post a panel with the channel picker.
- Self roles: pick 2 roles, fill the form, and the panel is posted. Clicking a panel button toggles the role.
- As a member with Manage Server but not Administrator, the Honeypot, Auto role and Self roles sections are not listed.
- `/help` → Setup lists `/setup` once, alongside the old setup commands.
