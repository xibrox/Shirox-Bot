# /setup dashboard

Replaces `docs/superpowers/specs/2026-10-15-command-groups-design.md`, which
grouped commands as `/setup <entry> <subcommand>` and `/mod <entry>`. The
user wants a single `/setup` command that opens an interactive dashboard
instead of subcommands. A `/mod` moderation panel follows as a separate
project with its own spec.

## Goal

`/setup` takes no options. It opens a private (ephemeral) embed dashboard
that shows every server feature's current status and lets staff change
settings with buttons, channel/role pickers and forms. Only sections the
member has permission for are shown. All existing commands (`/welcome`,
`/automod`, `/faqmanage`, ...) keep working and share the same logic.

## Removing the command groups

The merged grouping work is removed:

- Delete `lib/commandGroup.js`, `commands/mod.js`, `test/commandGroup.test.js`,
  `test/groups.test.js` and `test/help.test.js`.
- Restore `commands/help.js` to how it was before the grouping work
  (commit `df38827`). `/setup` is listed as a normal command under Setup.
- Replace `commands/setup.js` with the dashboard command.
- Keep the `"test": "bun test"` script in `package.json`.

`/mod` doesn't exist between this project and the `/mod` panel project.
`/ban`, `/kick` and the rest stay.

## Command

- `/setup`: no options, `setDefaultMemberPermissions(ManageGuild)`,
  `setDMPermission(false)`, category `setup`.
- Running it replies ephemerally with the Home view.

## Layout

- `commands/setup.js`: slash definition, Home view, and routing of every
  `setup:` component and modal to a section.
- `lib/setup/sections/<id>.js`, one file per section. Each exports:
  - `id`: used in custom IDs, e.g. `welcome`.
  - `label` and `emoji`: shown in the menu and on Home.
  - `permission`: a `PermissionFlagsBits` value the member needs.
  - `status(config, guild)`: one line of text for Home, e.g. `on · #general`.
  - `view(interaction, notice?)`: returns a full update payload
    `{ content, embeds, components }`. `notice` is an optional line shown
    as `content` above the embed (a success or error message).
  - `handleComponent(interaction, action, arg)` and, if the section uses
    forms, `handleModal(interaction, action, arg)`.
- `lib/setup/sections/index.js` exports the ordered list of sections.
  Future features (prefix, mod roles, invite allowlist, join whitelist,
  social embeds) are added as new section files.
- `lib/setup/ui.js` has shared helpers: the `◀ Home` button row, on/off
  toggle buttons, and a channel picker row limited to text/announcement
  channels.

Custom IDs look like `setup:<section>:<action>[:<arg>]` (max 100
characters). `index.js` already routes the `setup:` prefix to
`commands/setup.js`, which looks up the section and calls its handler.

## Shared logic (extracted so slash commands and the dashboard agree)

These checks and actions move out of the command files into `lib/`. The
command files call them so behaviour stays identical. Each check returns an
error message string, or `null` if things are fine, matching the existing
`checkHierarchy` style.

- `lib/channelChecks.js`: `missingChannelPermissions(channel, member, perms)`
  returns e.g. `❌ I need View Channel, Send Messages and Embed Links in #x.`
  or `null`. It is used by welcome, goodbye, logs and honeypot.
- `lib/honeypot.js` (new):
  - `honeypotError(guild, channel, action)` checks Kick/Ban Members and
    channel permissions.
  - `honeypotWarningEmbed(action)` is the warning embed `/honeypot set`
    posts now.
  - `ACTION_LABELS`.
- `lib/restoreRoles.js` (new): `setRestoreRoles(guild, enabled)` returns an
  error or `null`. It updates the config and fetches members when enabling,
  as `/restoreroles` does now. `RESTORE_RULES` is the rules text shown when
  enabling.
- `lib/selfRoles.js` (new): `buildSelfRolePanel(title, description, roles)`
  returns `{ embeds, components }`. `MAX_SELF_ROLES = 10`.
- `lib/faq.js` gains `faqPanel(faqs)`, which returns the panel message
  `/faqmanage panel` posts now. `faqModal` moves from `faqmanage.js` into
  `lib/faq.js` so the dashboard can open the same form.
- `checkAssignableRole(interaction, role)` in `lib/moderation.js` stays
  as it is. Component interactions have `user`, `member` and `guild` too.

Behaviour that differs between a dashboard click and a slash command is
limited to the reply. The dashboard updates its own message; slash
commands reply as they do now.

## Home view

- Title `⚙️ <server name> setup`, server icon as thumbnail.
- One field per visible section: `<emoji> <label>` → `status(...)`.
- A select menu `setup:home:open` lists the visible sections.
- Footer: `Only you can see this. Changes save immediately.`
- If the member can see no sections (can't happen with ManageGuild
  visibility, but guarded anyway), the reply is
  `❌ You don't have permission to change any settings.`

## Sections

Every section view has the `◀ Home` button in its last row, uses at most 5
action rows, and puts at most 25 options in any menu.

| Section | Permission | View shows | Controls |
|---|---|---|---|
| 📢 Welcome | ManageGuild | channel, message (or *default*), placeholders | channel picker; **Edit message** (form, prefilled, max 1000, empty = default); **Preview** (ephemeral follow-up with the embed for you); **Disable** |
| 👋 Goodbye | ManageGuild | same as welcome | same as welcome |
| 🍯 Honeypot | Administrator | channel, action | channel picker; action menu (soft ban / ban / kick); **Post warning** (sends the warning embed to the channel); **Disable** |
| 🛡️ Automod | ManageGuild | each rule's state | toggle buttons for Invites, Links, Spam; **Limits** form (mention limit 0–50, minimum account age 0–365 days; 0 = off) |
| 📜 Logs | ManageGuild | channel; warning if the bot lacks View Audit Log | channel picker; **Disable** |
| 👤 Auto role | ManageRoles | member role, bot role | role picker for members; role picker for bots; **Clear members**, **Clear bots** |
| ♻️ Role restore | ManageGuild | on/off and the rules text | on/off toggle (same checks and member fetch as `/restoreroles`); shows the auto-role note when relevant |
| ❓ FAQ | ManageGuild | number of questions, first 25 listed | **Add** (opens the existing FAQ form, which continues into the existing preview flow); question menu → **Edit** opens the prefilled form, **Remove** deletes it and refreshes; **Post panel** channel picker |
| 🎭 Self roles | ManageRoles | how it works | role picker (1–10 roles) → form for title (max 200) and description (max 1000) → panel posted in the channel where `/setup` was run |

Notes:

- Picking a channel or role saves it immediately, after the same checks the
  slash command runs. On error, the section re-renders with the error as its
  notice and the setting is unchanged.
- Welcome/goodbye: picking a channel keeps the current message. Editing the
  message without a channel set saves the message and shows the notice
  `Pick a channel to turn it on.`
- FAQ: the add/edit forms reuse the `faqmanage:` custom IDs, so their submit
  goes through `faqmanage.handleModal` and the existing preview/save flow.
  The dashboard message isn't refreshed by that flow. The FAQ section shows
  the new count the next time it is opened. This is deliberate: the preview
  flow is its own message.
- FAQ removal through the menu asks for no confirmation, which matches
  `/faqmanage remove`.
- Self roles: ten role IDs don't fit in a 100-character custom ID, so the
  picked role IDs are stored with `saveDraft()` from `lib/preview.js`. The
  form's custom ID carries only the draft ID
  (`setup:selfroles:post:<draftId>`). An expired draft shows the existing
  `EXPIRED` message.

## Permissions and safety

- The dashboard is ephemeral, so only the person who ran `/setup` can
  click it.
- Every component and modal handler still checks the section's
  `permission` against `interaction.memberPermissions`. On failure it
  replies ephemerally with `❌ You need **<Permission>** for this.`, using
  the names shown in Discord (Manage Server, Manage Roles, Administrator).
- Unknown section or action (for example after a bot update): an ephemeral
  `⚠️ This dashboard is out of date. Run /setup again.`

## Error handling

- Discord API failures while saving or posting (missing access, deleted
  channel) re-render the section with a `❌` notice. They never throw out
  to the generic "There was an error" reply when the cause is known.
- Unexpected errors still reach the existing catch in `index.js`.

## Testing

- Unit tests (`bun test`) for the extracted helpers:
  `missingChannelPermissions`, `honeypotError`, `setRestoreRoles`,
  `buildSelfRolePanel` (at most 2 rows of 5 buttons for 10 roles),
  `faqPanel` (at most 25 options).
- A view test for every section and for Home, using a fake interaction and
  guild with empty and fully filled config. It checks that `toJSON()`
  succeeds on every component, there are at most 5 rows, menus have at
  most 25 options, every custom ID is at most 100 characters and starts
  with `setup:` or `faqmanage:`, and the last row has `◀ Home`.
- A routing test: every custom ID produced by every view resolves to an
  existing section handler.
- A permission test: Home for a Manage Server–only member hides Honeypot,
  Auto role and Self roles. A component for Honeypot from that member gets
  the permission reply.
- Manual checks in a test server: open each section, change one setting,
  and confirm the slash command's `show` reports the same value.

## Out of scope

- The `/mod` moderation panel (next project).
- Mod roles, prefix, and the other roadmap items. They become sections
  later.
- Changing how the old slash commands reply.
