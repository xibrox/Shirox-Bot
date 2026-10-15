# /setup and /mod command groups

## Goal

Give server staff two grouped commands, `/setup` for server configuration and
`/mod` for moderation, while every existing top-level command (`/ban`,
`/welcome`, `/automod`, ...) keeps working unchanged.

This is project 1 of a larger roadmap (see the end of this file). Later
settings (prefix, bot mod list, invite allowlist, join whitelist, social
embeds) will be added as new `/setup` entries.

## Command shape

`/setup` contains these existing modules:

| Entry under /setup | Source module | Becomes |
|---|---|---|
| welcome | welcome.js | group: set, disable, show |
| goodbye | goodbye.js | group: set, disable, show |
| honeypot | honeypot.js | group: set, disable, show |
| automod | automod.js | group: invites, links, mentions, spam, new_accounts, show |
| logs | logs.js | group: set, disable, show |
| autorole | autorole.js | group: set, disable, show |
| faq | faqmanage.js | group: add, edit, remove, panel |
| restoreroles | restoreroles.js | subcommand (same options) |
| selfroles | selfroles.js | subcommand (same options) |

`/mod` contains these existing modules:

| Entry under /mod | Source module | Becomes |
|---|---|---|
| ban, unban, kick, softban, timeout, warn, purge, lock, slowmode, say | same names | subcommand (same options) |
| warnings | warnings.js | group: list, remove, clear |
| role | role.js | group: add, remove |
| embed | embed.js | group: create, edit |

Fun, utility, owner commands and right-click apps are not grouped. The old
top-level commands all stay deployed.

## Architecture

There is a new helper, `lib/commandGroup.js`, with
`buildCommandGroup({ name, description, category, defaultPermission, entries })`,
where `entries` maps an entry name to a command module. It returns a normal
command module (`data`, `category`, `execute`, `autocomplete`) that the
existing loader in `index.js` and `deploy-commands.js` picks up with no
changes to them.

There are two new command files that just declare their entries:

- `commands/setup.js`: `buildCommandGroup({ name: 'setup', defaultPermission: ManageGuild, entries: {...} })`
- `commands/mod.js`: `buildCommandGroup({ name: 'mod', defaultPermission: ModerateMembers, entries: {...} })`

### Building the definition

For each entry, the builder reads the source module's `data.toJSON()`:

- If its options are subcommands, it becomes a subcommand group named after
  the entry. The group's description is the module's description, and its
  subcommands are copied as they are.
- Otherwise it becomes one subcommand named after the entry, with the
  module's description and options copied as they are.

The built command uses `setDMPermission(false)` and the given
`defaultPermission` for visibility.

### Dispatch

`execute(interaction)` works out the entry: the subcommand group if there
is one, otherwise the subcommand. Then:

1. Permission check: if the source module declares
   `default_member_permissions` and `interaction.memberPermissions` lacks
   any of those bits, it replies ephemerally with
   `❌ You need **<Permission Name>** for this.` and stops.
2. It calls `sourceModule.execute(interaction)`.

`interaction.options.getSubcommand()` returns the same value the module
sees today (for example `/setup automod invites` → `"invites"`), and options
are read by name, so source modules need no changes.

`autocomplete(interaction)` resolves the entry the same way and forwards to
`sourceModule.autocomplete` if it exists (needed for `/setup faq`).

Buttons, select menus and modals keep their existing `customId` prefixes
(`faqmanage:`, `selfroles:`, ...). The router in `index.js` sends them to
the original modules no matter which command created them.

### Help

`/help` needs to understand group commands:

- `/setup` is listed under Setup and `/mod` under Moderation.
- In `describe()`, subcommand groups are expanded as
  `/setup automod invites <enabled>`, the same way plain subcommands are
  today.
- Entries the member lacks the source module's permission for are hidden,
  matching the existing `canUse` filtering.

To support this, the built module exposes `entries` (name → source module)
so `help.js` can check permissions for each entry.

## Error handling

- Missing permission: an ephemeral message naming the permission, and
  nothing runs.
- An unknown entry (stale deployment): the same message `index.js` already
  uses for unknown commands ("This command isn't loaded yet...").
- Errors thrown by source modules propagate to the existing catch in
  `index.js`, which already replies with the generic error message.
- At build time, if a definition goes over Discord limits (more than 25
  entries, or more than 25 subcommands in a group), the builder throws, so
  the problem shows up at startup or deploy and not as a silent Discord
  rejection.

## Testing

- Add `bun test` with `test/commandGroup.test.js`:
  - `/setup` and `/mod` build without throwing, and `toJSON()` succeeds.
  - Each entry has the expected type (group or subcommand) and the
    subcommand names match the source module.
  - Dispatch: a fake interaction for `/mod ban` reaches `ban.execute` when
    the member has Ban Members, and gets the permission reply when they
    don't.
  - Autocomplete for `/setup faq edit` reaches `faqmanage.autocomplete`.
- Manual check in a test server after `bun run deploy`:
  `/setup welcome show`, `/setup automod show`, `/setup faq edit`
  (autocomplete), `/mod warnings list`, `/mod ban` as a member without Ban
  Members (denied), and `/help` → Setup and Moderation.

## Out of scope

- Removing or renaming the old commands.
- The bot mod list and mod roles (project 2). For now, visibility is still
  Discord's `default_member_permissions`.

## Roadmap (each item gets its own design)

1. **This spec:** `/setup` and `/mod` groups.
2. Bot mod list and mod roles: admins are always allowed, plus configurable
   mod roles/users and a list of commands each one is restricted from. This
   replaces visibility based on `default_member_permissions` with checks
   inside the bot.
3. Configurable prefix (default `!`).
4. Adding an emoji or sticker from another server by ID, emoji, or message.
5. Sticker ↔ GIF conversion.
6. Allowlist (servers or invite codes) for the existing invite filter.
7. Join whitelist: kick members who aren't whitelisted when they join.
8. Social media auto-embed with a choice of fix service for each platform.
