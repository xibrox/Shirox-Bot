# /setup and /mod Command Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/setup` and `/mod` slash commands that group the existing setup and moderation commands, without changing or removing any existing command.

**Architecture:** A helper `buildCommandGroup()` in `lib/commandGroup.js` takes a map of entry name → existing command module. It builds a Discord definition that nests each module as a subcommand, or as a subcommand group if the module already has subcommands. It then dispatches to the module's own `execute`/`autocomplete` after checking the module's declared permission. `commands/setup.js` and `commands/mod.js` only declare their entries. `/help` learns to show group commands.

**Tech Stack:** Node/Bun, discord.js 14 (`SlashCommandBuilder`, `SlashCommandSubcommandBuilder`, `SlashCommandSubcommandGroupBuilder`, `PermissionsBitField`), `bun test`.

**Spec:** `docs/superpowers/specs/2026-10-15-command-groups-design.md`

## Global Constraints

- Use bun for everything (`bun test`, `bun run deploy`), never npm/npx.
- Old top-level commands (`/ban`, `/welcome`, `/automod`, ...) stay deployed and unchanged.
- `/setup` visibility: `PermissionFlagsBits.ManageGuild`. `/mod` visibility: `PermissionFlagsBits.ModerateMembers`. Both use `setDMPermission(false)`.
- Permission-denied reply text: `❌ You need **<Permission Name>** for this.` (ephemeral). Permission names are split on camel case, e.g. `BanMembers` → `Ban Members`.
- Unknown-entry reply text: `⚠️ This command isn't loaded yet. The bot needs to be updated and restarted.` (ephemeral, same as `index.js`).
- At most 25 entries per group command and 25 subcommands per group. Exceeding this throws at build time.
- Code style: files in `lib/` use double quotes and 4-space indents. Files in `commands/` use single quotes and 2-space indents. Comments are sparse and explain *why*.
- Commit messages: plain sentence style like the existing history (e.g. "Add /setup and /mod command groups"), with **no** `Co-Authored-By` trailer.

## Review Focus

- A member with **Administrator** but not the specific bit (e.g. Ban Members) must be allowed. `PermissionsBitField.missing()` respects admin by default, and Task 1 pins this.
- Autocomplete on an entry whose module has no `autocomplete` must answer `respond([])` and not leave Discord's request hanging (Task 1).
- `/help` must not list both `/welcome` and `/setup welcome` as separate commands, and must hide `/setup honeypot` from a Manage Server member who isn't an admin (Task 3).
- Every source module's definition must still serialize inside the group. A module that already has a subcommand *group* cannot be nested and must throw at build time, not be rejected silently by Discord on deploy (Task 1, Task 2).
- Buttons, menus and forms created through `/setup faq` and `/setup selfroles` must still work. Their `customId` prefixes are unchanged and `index.js` routes by prefix. This is checked manually in Task 4.

## File Structure

- Create `lib/commandGroup.js`: builds a group command module from entries; handles dispatch, permission check and autocomplete forwarding.
- Create `commands/setup.js`: declares `/setup` entries.
- Create `commands/mod.js`: declares `/mod` entries.
- Modify `commands/help.js`: render group commands and hide modules that live inside a group.
- Modify `package.json`: add a `"test": "bun test"` script.
- Create `test/commandGroup.test.js`: unit tests for the helper with fake modules.
- Create `test/groups.test.js`: structure tests for the real `/setup` and `/mod`.
- Create `test/help.test.js`: tests for help rendering of groups.

`index.js` and `deploy-commands.js` need **no** changes. They already load every `commands/*.js` module that has `data` and `execute`.

---

### Task 1: `buildCommandGroup` helper

**Files:**
- Create: `lib/commandGroup.js`
- Modify: `package.json` (scripts)
- Test: `test/commandGroup.test.js`

**Interfaces:**
- Consumes: existing command modules shaped `{ category, data: SlashCommandBuilder, execute(interaction), autocomplete?(interaction) }`.
- Produces: `buildCommandGroup({ name: string, description: string, category: string, defaultPermission: bigint, entries: Record<string, CommandModule> })` returns `{ category, entries, data: SlashCommandBuilder, execute(interaction), autocomplete(interaction) }`. `entries` is the same object that was passed in. Later tasks rely on `.entries` and on `.data`.

- [ ] **Step 1: Add the test script**

In `package.json`, change `"scripts"` to:

```json
  "scripts": {
    "start": "node index.js",
    "deploy": "node deploy-commands.js",
    "test": "bun test"
  },
```

- [ ] **Step 2: Write the failing tests**

Create `test/commandGroup.test.js`:

```js
const { describe, test, expect, mock } = require("bun:test");
const { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField } = require("discord.js");
const { buildCommandGroup } = require("../lib/commandGroup");

// Fresh fake modules per test so mock call counts don't leak between tests
function makeModules() {
    const ban = {
        category: "moderation",
        data: new SlashCommandBuilder()
            .setName("ban")
            .setDescription("Ban a user")
            .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
        execute: mock(async () => {}),
    };
    const faqmanage = {
        category: "setup",
        data: new SlashCommandBuilder()
            .setName("faqmanage")
            .setDescription("Manage the FAQ")
            .addSubcommand(s => s.setName("edit").setDescription("Edit a question")
                .addStringOption(o => o.setName("question").setDescription("Question").setAutocomplete(true)))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
        execute: mock(async () => {}),
        autocomplete: mock(async () => {}),
    };
    const ping = {
        category: "utility",
        data: new SlashCommandBuilder().setName("ping").setDescription("Pong"),
        execute: mock(async () => {}),
    };
    return { ban, faqmanage, ping };
}

function makeGroup(modules) {
    return buildCommandGroup({
        name: "test",
        description: "Test group",
        category: "setup",
        defaultPermission: PermissionFlagsBits.ManageGuild,
        entries: { ban: modules.ban, faq: modules.faqmanage, ping: modules.ping },
    });
}

function fakeInteraction({ group = null, subcommand, permissions = 0n }) {
    return {
        options: { getSubcommandGroup: () => group, getSubcommand: () => subcommand },
        memberPermissions: new PermissionsBitField(permissions),
        reply: mock(async () => {}),
        respond: mock(async () => {}),
    };
}

describe("definition", () => {
    test("nests plain commands as subcommands and subcommand commands as groups", () => {
        const json = makeGroup(makeModules()).data.toJSON();
        expect(json.name).toBe("test");
        expect(json.default_member_permissions).toBe(String(PermissionFlagsBits.ManageGuild));
        expect(json.dm_permission).toBe(false);

        const [ban, faq] = json.options;
        expect(ban).toMatchObject({ type: 1, name: "ban", description: "Ban a user" });
        expect(ban.options.map(o => o.name)).toEqual(["user"]);
        expect(faq).toMatchObject({ type: 2, name: "faq", description: "Manage the FAQ" });
        expect(faq.options.map(o => o.name)).toEqual(["edit"]);
        expect(faq.options[0].options[0]).toMatchObject({ name: "question", autocomplete: true });
    });

    test("exposes the entries and category", () => {
        const modules = makeModules();
        const group = makeGroup(modules);
        expect(group.entries.faq).toBe(modules.faqmanage);
        expect(group.category).toBe("setup");
    });

    test("throws when there are more than 25 entries", () => {
        const { ping } = makeModules();
        const entries = Object.fromEntries(Array.from({ length: 26 }, (_, i) => [`ping${i}`, ping]));
        expect(() => buildCommandGroup({ name: "big", description: "x", category: "setup", defaultPermission: PermissionFlagsBits.ManageGuild, entries }))
            .toThrow(/26 entries/);
    });

    test("throws when a module already has a subcommand group", () => {
        const nested = {
            data: new SlashCommandBuilder().setName("nested").setDescription("x")
                .addSubcommandGroup(g => g.setName("inner").setDescription("x")
                    .addSubcommand(s => s.setName("leaf").setDescription("x"))),
            execute: async () => {},
        };
        expect(() => buildCommandGroup({ name: "bad", description: "x", category: "setup", defaultPermission: PermissionFlagsBits.ManageGuild, entries: { nested } }))
            .toThrow(/nested/);
    });
});

describe("execute", () => {
    test("runs the module when the member has its permission", async () => {
        const modules = makeModules();
        const interaction = fakeInteraction({ subcommand: "ban", permissions: PermissionFlagsBits.BanMembers });
        await makeGroup(modules).execute(interaction);
        expect(modules.ban.execute).toHaveBeenCalledWith(interaction);
        expect(interaction.reply).not.toHaveBeenCalled();
    });

    test("lets administrators through without the specific permission", async () => {
        const modules = makeModules();
        const interaction = fakeInteraction({ subcommand: "ban", permissions: PermissionFlagsBits.Administrator });
        await makeGroup(modules).execute(interaction);
        expect(modules.ban.execute).toHaveBeenCalledWith(interaction);
    });

    test("refuses and names the missing permission", async () => {
        const modules = makeModules();
        const interaction = fakeInteraction({ subcommand: "ban", permissions: PermissionFlagsBits.KickMembers });
        await makeGroup(modules).execute(interaction);
        expect(modules.ban.execute).not.toHaveBeenCalled();
        expect(interaction.reply.mock.calls[0][0].content).toBe("❌ You need **Ban Members** for this.");
    });

    test("runs modules without a declared permission for anyone", async () => {
        const modules = makeModules();
        const interaction = fakeInteraction({ subcommand: "ping" });
        await makeGroup(modules).execute(interaction);
        expect(modules.ping.execute).toHaveBeenCalledWith(interaction);
    });

    test("routes group entries by their group name", async () => {
        const modules = makeModules();
        const interaction = fakeInteraction({ group: "faq", subcommand: "edit", permissions: PermissionFlagsBits.ManageGuild });
        await makeGroup(modules).execute(interaction);
        expect(modules.faqmanage.execute).toHaveBeenCalledWith(interaction);
    });

    test("replies with the not-loaded message for unknown entries", async () => {
        const interaction = fakeInteraction({ subcommand: "gone", permissions: PermissionFlagsBits.Administrator });
        await makeGroup(makeModules()).execute(interaction);
        expect(interaction.reply.mock.calls[0][0].content).toBe("⚠️ This command isn't loaded yet. The bot needs to be updated and restarted.");
    });
});

describe("autocomplete", () => {
    test("forwards to the module's autocomplete", async () => {
        const modules = makeModules();
        const interaction = fakeInteraction({ group: "faq", subcommand: "edit" });
        await makeGroup(modules).autocomplete(interaction);
        expect(modules.faqmanage.autocomplete).toHaveBeenCalledWith(interaction);
    });

    test("answers with no choices when the module has no autocomplete", async () => {
        const interaction = fakeInteraction({ subcommand: "ban" });
        await makeGroup(makeModules()).autocomplete(interaction);
        expect(interaction.respond).toHaveBeenCalledWith([]);
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test test/commandGroup.test.js`
Expected: FAIL, `Cannot find module '../lib/commandGroup'`.

- [ ] **Step 4: Implement `lib/commandGroup.js`**

```js
const {
    SlashCommandBuilder,
    SlashCommandSubcommandBuilder,
    SlashCommandSubcommandGroupBuilder,
    ApplicationCommandOptionType,
    MessageFlags,
} = require("discord.js");

// Discord's limit for options (subcommands/groups) on one command or group
const MAX_OPTIONS = 25;
const NOT_LOADED = "⚠️ This command isn't loaded yet. The bot needs to be updated and restarted.";

// "BanMembers" -> "Ban Members"
const permissionName = flag => flag.replace(/(?<=[a-z])(?=[A-Z])/g, " ");
const optionType = option => option.toJSON().type;

// Turns one existing command module into a subcommand (plain command) or a subcommand group (command with subcommands)
function nestEntry(groupName, entryName, source) {
    const options = source.data.options;
    if (options.some(o => optionType(o) === ApplicationCommandOptionType.SubcommandGroup)) {
        throw new Error(`/${groupName} ${entryName}: /${source.data.name} has subcommand groups, which can't be nested`);
    }
    if (options.some(o => optionType(o) === ApplicationCommandOptionType.Subcommand)) {
        if (options.length > MAX_OPTIONS) {
            throw new Error(`/${groupName} ${entryName} has ${options.length} subcommands (Discord allows ${MAX_OPTIONS})`);
        }
        const group = new SlashCommandSubcommandGroupBuilder().setName(entryName).setDescription(source.data.description);
        group.options.push(...options);
        return group;
    }
    const subcommand = new SlashCommandSubcommandBuilder().setName(entryName).setDescription(source.data.description);
    subcommand.options.push(...options);
    return subcommand;
}

// Builds a command like /setup or /mod whose entries are existing command modules, so each command's code lives in one place
function buildCommandGroup({ name, description, category, defaultPermission, entries }) {
    const count = Object.keys(entries).length;
    if (count > MAX_OPTIONS) throw new Error(`/${name} has ${count} entries (Discord allows ${MAX_OPTIONS})`);

    const data = new SlashCommandBuilder()
        .setName(name)
        .setDescription(description)
        .setDefaultMemberPermissions(defaultPermission)
        .setDMPermission(false);
    for (const [entryName, source] of Object.entries(entries)) {
        const nested = nestEntry(name, entryName, source);
        if (nested instanceof SlashCommandSubcommandGroupBuilder) data.addSubcommandGroup(nested);
        else data.addSubcommand(nested);
    }

    const resolve = interaction => entries[interaction.options.getSubcommandGroup(false) ?? interaction.options.getSubcommand()];

    return {
        category,
        entries,
        data,

        async execute(interaction) {
            const source = resolve(interaction);
            if (!source) return interaction.reply({ content: NOT_LOADED, flags: MessageFlags.Ephemeral });

            // Visibility only covers the whole group, so each entry's own permission is checked here
            const required = source.data.default_member_permissions;
            const missing = required ? interaction.memberPermissions.missing(BigInt(required)) : [];
            if (missing.length) {
                return interaction.reply({ content: `❌ You need **${missing.map(permissionName).join(", ")}** for this.`, flags: MessageFlags.Ephemeral });
            }
            return source.execute(interaction);
        },

        async autocomplete(interaction) {
            const source = resolve(interaction);
            if (source?.autocomplete) return source.autocomplete(interaction);
            return interaction.respond([]);
        },
    };
}

module.exports = { buildCommandGroup };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test test/commandGroup.test.js`
Expected: PASS, 12 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json lib/commandGroup.js test/commandGroup.test.js
git commit -m "Add helper for grouping existing commands under one command"
```

---

### Task 2: `/setup` and `/mod` commands

**Files:**
- Create: `commands/setup.js`
- Create: `commands/mod.js`
- Test: `test/groups.test.js`

**Interfaces:**
- Consumes: `buildCommandGroup` from Task 1 (`require('../lib/commandGroup')`).
- Produces: `commands/setup.js` and `commands/mod.js` export group modules with `.entries`. Task 3's help rendering reads `.entries`.

- [ ] **Step 1: Write the failing tests**

Create `test/groups.test.js`:

```js
const { describe, test, expect } = require("bun:test");
const { PermissionFlagsBits } = require("discord.js");

const setup = require("../commands/setup");
const mod = require("../commands/mod");

const SETUP_ENTRIES = {
    welcome: "welcome", goodbye: "goodbye", honeypot: "honeypot", automod: "automod", logs: "logs",
    autorole: "autorole", faq: "faqmanage", restoreroles: "restoreroles", selfroles: "selfroles",
};
const MOD_ENTRIES = {
    ban: "ban", unban: "unban", kick: "kick", softban: "softban", timeout: "timeout", warn: "warn",
    warnings: "warnings", purge: "purge", lock: "lock", slowmode: "slowmode", role: "role", say: "say", embed: "embed",
};

// Each entry must mirror its source module: same subcommands for groups, same options for plain commands
function expectMirrors(groupJson, entries) {
    expect(groupJson.options.map(o => o.name)).toEqual(Object.keys(entries));
    for (const [entryName, file] of Object.entries(entries)) {
        const sourceJson = require(`../commands/${file}`).data.toJSON();
        const entryJson = groupJson.options.find(o => o.name === entryName);
        const sourceIsGroup = (sourceJson.options || []).some(o => o.type === 1);
        expect(entryJson.type).toBe(sourceIsGroup ? 2 : 1);
        expect(entryJson.description).toBe(sourceJson.description);
        expect((entryJson.options || []).map(o => o.name)).toEqual((sourceJson.options || []).map(o => o.name));
    }
}

describe("/setup", () => {
    test("serializes with the expected entries", () => {
        const json = setup.data.toJSON();
        expect(json.name).toBe("setup");
        expect(json.default_member_permissions).toBe(String(PermissionFlagsBits.ManageGuild));
        expect(json.dm_permission).toBe(false);
        expectMirrors(json, SETUP_ENTRIES);
    });

    test("is in the setup category", () => {
        expect(setup.category).toBe("setup");
    });
});

describe("/mod", () => {
    test("serializes with the expected entries", () => {
        const json = mod.data.toJSON();
        expect(json.name).toBe("mod");
        expect(json.default_member_permissions).toBe(String(PermissionFlagsBits.ModerateMembers));
        expect(json.dm_permission).toBe(false);
        expectMirrors(json, MOD_ENTRIES);
    });

    test("is in the moderation category", () => {
        expect(mod.category).toBe("moderation");
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/groups.test.js`
Expected: FAIL, `Cannot find module '../commands/setup'`.

- [ ] **Step 3: Create `commands/setup.js`**

```js
const { PermissionFlagsBits } = require('discord.js');
const { buildCommandGroup } = require('../lib/commandGroup');

module.exports = buildCommandGroup({
  name: 'setup',
  description: 'Set up the bot for this server (welcome, logs, honeypot, automod...)',
  category: 'setup',
  defaultPermission: PermissionFlagsBits.ManageGuild,
  entries: {
    welcome: require('./welcome'),
    goodbye: require('./goodbye'),
    honeypot: require('./honeypot'),
    automod: require('./automod'),
    logs: require('./logs'),
    autorole: require('./autorole'),
    faq: require('./faqmanage'),
    restoreroles: require('./restoreroles'),
    selfroles: require('./selfroles'),
  },
});
```

- [ ] **Step 4: Create `commands/mod.js`**

```js
const { PermissionFlagsBits } = require('discord.js');
const { buildCommandGroup } = require('../lib/commandGroup');

module.exports = buildCommandGroup({
  name: 'mod',
  description: 'Moderation commands (ban, kick, timeout, warnings, purge...)',
  category: 'moderation',
  defaultPermission: PermissionFlagsBits.ModerateMembers,
  entries: {
    ban: require('./ban'),
    unban: require('./unban'),
    kick: require('./kick'),
    softban: require('./softban'),
    timeout: require('./timeout'),
    warn: require('./warn'),
    warnings: require('./warnings'),
    purge: require('./purge'),
    lock: require('./lock'),
    slowmode: require('./slowmode'),
    role: require('./role'),
    say: require('./say'),
    embed: require('./embed'),
  },
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test`
Expected: PASS, all tests in both files.

- [ ] **Step 6: Confirm the bot's loader and deploy script pick them up**

Run: `bun -e "const fs=require('fs');const n=fs.readdirSync('commands').filter(f=>f.endsWith('.js')).map(f=>require('./commands/'+f)).filter(c=>'data' in c&&'execute' in c).map(c=>c.data.toJSON().name);console.log(n.length, n.includes('setup'), n.includes('mod'), n.includes('ban'))"`
Expected: `52 true true true`. That is 50 existing commands plus 2 new, with the old names still present.

- [ ] **Step 7: Commit**

```bash
git add commands/setup.js commands/mod.js test/groups.test.js
git commit -m "Add /setup and /mod command groups"
```

---

### Task 3: `/help` shows group commands

**Files:**
- Modify: `commands/help.js` (`visibleCommands`, `describe`, `categoryEmbeds`, `module.exports`)
- Test: `test/help.test.js`

**Interfaces:**
- Consumes: group modules expose `.entries` (`Record<string, CommandModule>`) and `.data` (Task 1/2).
- Produces: `help.js` additionally exports `visibleCommands(interaction, category)` and `describe(command, interaction)` (returns `string[]`) for tests.

Behaviour: a module that is an entry of a group command is **not** listed on its own. Each of its entries is listed inside the group section with `Shortcut: /<original name>`. An entry the member lacks permission for is hidden.

- [ ] **Step 1: Write the failing tests**

Create `test/help.test.js`:

```js
const { describe: group, test, expect } = require("bun:test");
const { Collection, PermissionsBitField, PermissionFlagsBits } = require("discord.js");

const help = require("../commands/help");
const setup = require("../commands/setup");
const mod = require("../commands/mod");
const welcome = require("../commands/welcome");
const ban = require("../commands/ban");
const ping = require("../commands/ping");

function fakeInteraction(permissions) {
    const commands = new Collection([setup, mod, welcome, ban, ping].map(c => [c.data.name, c]));
    return { client: { commands }, memberPermissions: new PermissionsBitField(permissions) };
}

group("help with group commands", () => {
    test("lists /setup but not the grouped /welcome on its own", () => {
        const names = help.visibleCommands(fakeInteraction(PermissionFlagsBits.Administrator), "setup").map(c => c.data.name);
        expect(names).toContain("setup");
        expect(names).not.toContain("welcome");
    });

    test("keeps ungrouped commands", () => {
        const names = help.visibleCommands(fakeInteraction(0n), "utility").map(c => c.data.name);
        expect(names).toContain("ping");
    });

    test("describes group entries with full usage and the shortcut", () => {
        const text = help.describe(setup, fakeInteraction(PermissionFlagsBits.Administrator)).join("\n\n");
        expect(text).toContain("`/setup automod invites <enabled>`");
        expect(text).toContain("Shortcut: `/automod`");
        expect(text).toContain("`/setup faq add`");
        expect(text).toContain("Shortcut: `/faqmanage`");
    });

    test("describes plain entries with their options", () => {
        const text = help.describe(mod, fakeInteraction(PermissionFlagsBits.Administrator)).join("\n\n");
        expect(text).toContain("`/mod ban <user> [reason] [delete_messages]`");
        expect(text).toContain("Shortcut: `/ban`");
    });

    test("hides entries the member lacks permission for", () => {
        const text = help.describe(setup, fakeInteraction(PermissionFlagsBits.ManageGuild)).join("\n\n");
        expect(text).toContain("/setup welcome");
        expect(text).not.toContain("/setup honeypot");
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/help.test.js`
Expected: FAIL, `help.visibleCommands is not a function`.

- [ ] **Step 3: Update `visibleCommands` in `commands/help.js`**

Replace the existing `visibleCommands` function with:

```js
// Modules that are also entries of a group command (/setup, /mod) are listed inside that group instead
function groupedModules(client) {
  return new Set([...client.commands.values()].flatMap(c => Object.values(c.entries || {})));
}

function visibleCommands(interaction, category) {
  const grouped = groupedModules(interaction.client);
  return [...interaction.client.commands.values()]
    .filter(c => c.category === category && !grouped.has(c) && canUse(c, interaction))
    .sort((a, b) => a.data.name.localeCompare(b.data.name));
}
```

- [ ] **Step 4: Update `describe` in `commands/help.js`**

Replace the existing `describe` function with the two functions below. `describeCommand` is the old body, with `json.name` in slash usage replaced by a `name` parameter:

```js
// One or more lines of help text for a command, generated from its definition
function describeCommand(command, name = command.data.name) {
  const json = command.data.toJSON();
  if (json.type === ApplicationCommandType.User || json.type === ApplicationCommandType.Message) {
    const target = json.type === ApplicationCommandType.User ? 'a user' : 'a message';
    return `**${json.name}**: right-click ${target} → Apps\n${command.description || ''}`;
  }

  const subcommands = (json.options || []).filter(o => o.type === ApplicationCommandOptionType.Subcommand);
  if (subcommands.length) {
    const lines = subcommands.map(s => `\`/${name} ${s.name}${formatOptions(s.options) ? ` ${formatOptions(s.options)}` : ''}\`: ${s.description}`);
    return `**/${name}**: ${json.description}\n${lines.join('\n')}`;
  }
  const usage = formatOptions(json.options);
  return `**\`/${name}${usage ? ` ${usage}` : ''}\`**\n${json.description}`;
}

// Help sections for a command; group commands get one section per entry the member can use
function describe(command, interaction) {
  if (!command.entries) return [describeCommand(command)];
  return Object.entries(command.entries)
    .filter(([, source]) => canUse(source, interaction))
    .map(([entryName, source]) => `${describeCommand(source, `${command.data.name} ${entryName}`)}\nShortcut: \`/${source.data.name}\``);
}
```

- [ ] **Step 5: Update `categoryEmbeds` in `commands/help.js`**

Change its first line from:

```js
  const sections = visibleCommands(interaction, category).map(describe);
```

to:

```js
  const sections = visibleCommands(interaction, category).flatMap(command => describe(command, interaction));
```

- [ ] **Step 6: Export the helpers**

In `module.exports` of `commands/help.js`, add these two properties directly after `category: 'utility',`:

```js
  visibleCommands,
  describe,
```

- [ ] **Step 7: Run all tests**

Run: `bun test`
Expected: PASS, all tests in all three files.

- [ ] **Step 8: Commit**

```bash
git add commands/help.js test/help.test.js
git commit -m "Show /setup and /mod entries in /help"
```

---

### Task 4: Deploy and verify in Discord

**Files:** none (manual verification)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing in code.

- [ ] **Step 1: Ask before deploying**

`bun run deploy` replaces the bot's **global** commands on Discord. Ask the user to confirm before running it, and to restart the running bot afterwards so it loads `setup.js` and `mod.js`.

- [ ] **Step 2: Deploy**

Run: `bun run deploy`
Expected: `Successfully reloaded 52 application (/) commands.`

- [ ] **Step 3: Manual checks in a test server (user runs these)**

- `/setup welcome show` and `/setup automod show` show the same output as `/welcome show` and `/automod show`.
- `/setup faq edit`: the question field autocompletes. Submitting the edit form opens the preview, and its buttons work.
- `/setup selfroles` posts a panel, and clicking a role button toggles the role.
- `/mod warnings list` works.
- As a member with Moderate Members but not Ban Members, `/mod ban` replies `❌ You need **Ban Members** for this.`
- `/help` → Setup shows `/setup ...` entries with shortcuts, and does not list `/welcome` separately. `/help` → Moderation shows `/mod ...` entries.
- `/ban`, `/welcome` and the other old commands still work.
