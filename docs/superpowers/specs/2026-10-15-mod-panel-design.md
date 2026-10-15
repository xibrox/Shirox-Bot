# /mod moderation panel

A single `/mod` command that opens a private moderation panel, built the same
way as the `/setup` dashboard (`2026-10-15-setup-dashboard-design.md`). All
existing moderation slash commands keep working and share the panel's logic.

## Goals

- Moderate a member from one place: see their info and history, then warn,
  time out, kick, ban, softban, change their nickname or roles, and manage
  their warnings.
- Act on users who aren't in the server: ban by ID, and unban from the ban
  list.
- Channel tools: purge, lock/unlock, slowmode.
- A server-wide moderation history.
- Results are public in the channel (like `/ban`) and logged. The panel
  itself is private.

## Command and access

- `/mod`: no options. `setDefaultMemberPermissions(ModerateMembers)`,
  `setDMPermission(false)`, category `moderation`. It replies ephemerally
  with Home.
- Every action has a required permission:

| Action | Permission |
|---|---|
| Warn, warnings list/remove/clear, timeout, remove timeout | ModerateMembers |
| Kick | KickMembers |
| Ban, softban, unban, bans list | BanMembers |
| Nickname | ManageNicknames |
| Roles | ManageRoles |
| Purge | ManageMessages |
| Lock/unlock, slowmode | ManageChannels |
| History | ModerateMembers |

- A button is only shown if the member has its permission. Every click and
  form submit re-checks it and refuses with
  `❌ You need **<Permission>** for this.`
- Custom IDs are `mod:<view>:<action>[:<arg>]`, routed by `commands/mod.js`.
  `index.js` already routes the `mod:` prefix.
- An unknown view or action replies
  `⚠️ This panel is out of date. Run /mod again.`

## Shared logic: `lib/modActions.js`

Each action is a function that takes the interaction (which has `guild`,
`user`, `member`, `client` and `channel`) plus its inputs. It returns
`{ error }` or `{ publicLine, notice? }`. It never replies. The callers
reply:

- The slash command replies with `publicLine` (public) or `error`
  (ephemeral), exactly as today.
- The panel posts `publicLine` to `interaction.channel` with
  `allowedMentions: { parse: [] }`, then re-renders its view with
  `notice ?? publicLine` (or `error`).

Functions and their behaviour, copied from the current commands:

- `warnUser(interaction, user, reason)`
  - Refuses bots and the moderator themselves.
  - Calls `addWarning`, then DMs the user.
  - Returns the public line `⚠️ Warned **tag** (warning #n, t total). Reason: r`, plus
    `*(Couldn't DM them.)*` when the DM fails.
  - Logs a moderation embed and records history.
- `timeoutMember(interaction, member, durationText, reason)`
  - `off`, `remove`, `none` or `0` removes the timeout.
  - Otherwise it uses `parseDuration`, with a maximum of 28 days.
  - Checks `checkHierarchy` and `moderatable`. Same messages as `/timeout`.
- `kickMember(interaction, member, reason)`: `checkHierarchy`, `kickable`,
  then a DM. Same messages as `/kick`.
- `banUser(interaction, user, member | null, reason, deleteMessageSeconds)`
  - If the user is a member: `checkHierarchy`, `bannable`, then a DM.
  - Hackban by ID otherwise.
  - Same messages as `/ban`.
- `softbanMember(interaction, member, reason, deleteMessageSeconds = 86400)`:
  same as `/softban`, including its explicit log and `suppressLogsFor`.
  Records history.
- `unbanUser(interaction, userId, reason)`: same as `/unban`.
- `setNickname(interaction, member, nickname | null)`
  - `checkHierarchy` (skipped when the target is the moderator themselves),
    then `manageable`.
  - The public line is `✏️ Changed **tag**'s nickname to **x**.` or
    `✏️ Reset **tag**'s nickname.`
- `changeRoles(interaction, member, roles, adding)`
  - Applies `checkAssignableRole` to each role, then adds or removes them in
    one call.
  - Skips roles the member already has (when adding) or lacks (when removing).
  - The public line names the roles changed. If nothing changed it returns
    `{ error: "Nothing to change." }`.
- `purgeMessages(interaction, channel, amount, userId | null)`
  - Uses `bulkDelete`, filtered by user when given (scanning 100 messages).
  - Returns an ephemeral-style result: the panel shows it as a notice, and it
    has no public line.
  - Records history.
- `setLock(interaction, channel, locked, reason | null)`: same overwrite
  edit and messages as `/lock`. Records history.
- `setSlowmode(interaction, channel, durationText)`: same parsing and limits
  as `/slowmode`. Records history.

The refactored slash commands call these. `/purge` keeps its extra filters
(bots, humans, links, attachments, skip) and its own code path. Only the
panel uses `purgeMessages`. `/role add|remove` uses `changeRoles` with one
role. `/warnings remove|clear` keep using `lib/warnings.js` directly.

## Moderation history: `lib/modHistory.js`

- JSON store `mod-history`: `{ [guildId]: [{ type, targetId, moderatorId, reason, timestamp, extra? }] }`.
- Only the newest 500 entries per server are kept.
- `recordAction(guildId, entry)` sets `timestamp` itself.
- `getHistory(guildId, { targetId, limit })` returns the newest first.
- Types: `warn`, `timeout`, `untimeout`, `kick`, `ban`, `unban`, `softban`,
  `purge` (extra: count, channelId), `lock`, `unlock`, `slowmode` (extra:
  seconds, channelId), `honeypot` (extra: action).

Where entries come from:

| Type | Recorded by |
|---|---|
| warn, softban, purge, lock, unlock, slowmode | `lib/modActions.js` |
| ban, unban | `events/bans.js` |
| kick | `events/memberLeave.js` (when the audit log shows a kick) |
| timeout, untimeout | `events/memberUpdate.js` |
| honeypot | `events/honeypot.js` (moderator = the bot) |

- For the event-recorded types, the moderator and reason come from the
  audit log entry: the executor, and the reason with any `tag: ` prefix the
  bot adds left as is.
- Without View Audit Log they're recorded with `moderatorId: null`.
- Bot-performed bans, kicks and timeouts are recorded here too, with the bot
  as executor. The reason text carries the real moderator's tag. This is how
  the logs already work.
- Softbans are suppressed from the ban event (`suppressLogsFor`), so they
  appear once, as `softban`.

## Views

### Home

- Embed `🛡️ Moderation · <server>`, showing:
  - the count of currently timed-out members (from cache)
  - the ban count (fetched, or `?` if missing Ban Members)
  - the 5 newest history lines
- Rows:
  1. A user picker `mod:home:user` with placeholder `Pick a member…`.
  2. Buttons, each shown only with permission: `🔎 User by ID`, `🚫 Bans`,
     `💬 Channel tools`, `📜 History`.

### User view (`mod:user:<action>:<userId>`)

The embed has:

- Author: tag and avatar. The description has the mention, the ID, and
  `Not in this server` when applicable.
- Fields:
  - Account created.
  - Joined.
  - Top role.
  - Timeout: `until <t:…:R>` or `no`.
  - Banned: `yes` / `no`, only when not a member and the moderator has Ban
    Members.
  - Warnings: the count, with the newest 3 as `#id · reason · <t:…:R>`.
  - Recent history: the newest 5 for this user.

Rows (buttons hidden without permission, and disabled when the action can't
apply):

1. `⚠️ Warn`, `⏱️ Timeout` or `🔊 Remove timeout`, `👢 Kick`, `🔨 Ban` or
   `✅ Unban`, `🧹 Softban`.
   - For a non-member: Warn stays (warnings are kept by user ID), Timeout,
     Kick and Softban are hidden, and it shows Ban (hackban) or Unban.
2. `✏️ Nickname` and `🎭 Roles` (members only), `📋 Warnings`, `◀ Home`.

Forms:

| Button | Fields |
|---|---|
| Warn | Reason (required, max 400) |
| Timeout | Duration (required, e.g. `10m`, `1h`, `2d`, max 28d), Reason (optional) |
| Kick | Reason (optional) |
| Ban | Reason (optional), Delete messages from the last (optional: `0`, `1h`, `24h`, `7d`; default 0) |
| Softban | Reason (optional) |
| Unban | Reason (optional) |
| Nickname | New nickname (optional, max 32, prefilled; empty resets) |

`🔊 Remove timeout` acts immediately without a form.

### Roles view (`mod:roles:<action>:<userId>`)

- The embed lists the member's current roles.
- Rows:
  1. Picker `Give roles…` (up to 10).
  2. Picker `Remove roles…` (up to 10).
  3. `◀ Back` to the user, then `◀ Home`.
- Each pick calls `changeRoles` and re-renders.

### Warnings view (`mod:warnings:<action>:<userId>`)

- The embed lists the newest 25 warnings.
- Rows:
  1. A menu to remove one, shown only if there are any.
  2. `🗑️ Clear all` (it becomes `Confirm clear` + `Cancel`), `◀ Back`,
     `◀ Home`.
- Removing and clearing re-render with a notice and are logged as before.

### Bans view (`mod:bans:<action>`)

- The embed shows the number of bans and the newest 25 (`tag · reason`).
- Rows:
  1. A menu that opens the user.
  2. `🔎 User by ID`, `◀ Home`.
- It needs Ban Members. A fetch failure shows a notice.

### Channel tools (`mod:channel:<action>:<channelId>`)

- The embed shows the channel, lock state (whether @everyone has Send
  Messages denied) and slowmode.
- Rows:
  1. A channel picker (text/announcement), defaulting to the current channel.
  2. `🧹 Purge` (form: amount 1–100, from user ID optional), `🔒 Lock` /
     `🔓 Unlock` (form: reason optional), `🐌 Slowmode` (form: duration,
     `off` to disable), `◀ Home`.
- Public lines are posted in the target channel for lock/unlock/slowmode,
  the same as the commands. Purge only shows a private notice.

### History view (`mod:history:<action>`)

- The embed shows the newest 25 entries:
  `<emoji> **type** · <@target> · by <@mod or "unknown"> · reason · <t:…:R>`.
- Rows:
  1. A menu that opens the target user.
  2. `◀ Home`.

## Error handling

- Known failures are shown as a notice on the current view: missing bot
  permission, hierarchy, a member who left, an invalid duration, a deleted
  channel.
- A user ID that isn't a snowflake, or an unknown user, gives
  `❌ I can't find a user with that ID.`
- If a member left while their view was open, member-only actions reply with
  `❌ That user is not in this server.` and the view re-renders as a
  non-member.
- Unexpected errors go to the existing catch in `index.js`.

## Testing

- `lib/modActions.js`: one test per function for success and each refusal,
  using fakes (members with `kickable`, `bannable`, `moderatable`,
  `manageable`, and spies for `kick`, `timeout`, `roles.add`/`remove`,
  `setNickname`, guild `members.ban`/`unban`, channel `bulkDelete`,
  `permissionOverwrites.edit`, `setRateLimitPerUser`).
- `lib/modHistory.js`: record, cap at 500, filter by target, newest first.
- Event recording: a ban event records `ban` with the audit executor, and
  without audit access records `moderatorId: null`. A softban does not record
  a ban.
- Panel routing: unknown action → out of date, permission re-check, buttons
  hidden without permission.
- Views: the generic "within Discord limits" test, run on every view with
  member, non-member, banned, timed-out, 25+ warnings and 25+ history
  entries.
- Forms: each form submit calls the right action and posts the public line.
- Slash parity: `/ban`, `/kick`, `/timeout`, `/warn`, `/softban`, `/unban`,
  `/lock`, `/slowmode` and `/role` still reply with the same text (tested
  through the shared functions, plus a smoke test that each command module
  loads).

## Out of scope

- Configurable mod roles and per-command restrictions (roadmap project 2).
- Automatic punishments, such as a timeout after N warnings.
- Editing or deleting history entries.
