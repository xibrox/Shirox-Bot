# /setup dashboard v2: pause, log types, previews, self-role panel manager

Builds on `2026-10-15-setup-dashboard-design.md` (shipped). Everything there
still applies unless changed here. The `/mod` panel is a separate spec.

## Goals

1. Features with a channel can be **paused** and resumed without losing their
   settings.
2. Logs can be limited to the **types** of events a server wants.
3. Every embed the bot posts for a server can have its **title and text
   edited** and be **previewed** before it goes out.
4. Self-role panels can be **managed after posting**: change roles (up to 25),
   change text, delete. Older panels can be adopted.
5. Button names are **consistent** across sections.

## Button naming rules (all sections)

| Kind of control | Label | Style |
|---|---|---|
| Pauses a feature but keeps its settings | `⏸️ Pause` when running, `▶️ Resume` when paused | Secondary (grey) / Success (green) |
| Clears a feature's settings | `Disable` (or `Disable for <who>` when a section has two) | Danger (red) |
| A plain on/off setting | `<Name>: on` / `<Name>: off` | Success when on, Secondary when off (existing `toggleButton`) |
| Opens a form to edit text | `✏️ <What>` (e.g. `✏️ Edit message`, `✏️ Warning text`) | Secondary |
| Shows a private preview | `👁️ Preview` (or `👁️ Preview <what>`) | Secondary |
| Posts something publicly | `📤 Post` / `📤 Post warning` | Primary (blurple) |
| Navigation | `◀ Home`, `◀ Back` | Secondary |

Pause/Resume and Disable are disabled while nothing is set up (no channel).

## 1. Pause / resume

New config flags: `welcomeOff`, `goodbyeOff`, `logsOff`, `honeypotOff`. Each is
`true` when paused and absent otherwise.

`lib/features.js` (new) exports `FEATURES` and `isActive(config, feature)`.
`FEATURES` maps each feature id to its keys:

- `welcome` → `welcomeChannelId` / `welcomeOff`
- `goodbye` → `goodbyeChannelId` / `goodbyeOff`
- `logs` → `logChannelId` / `logsOff`
- `honeypot` → `honeypotChannelId` / `honeypotOff`

`isActive` is true when the channel key is set and the off key is not.
Callers never build key names themselves.

Events use `isActive`:

| Where | Today | Now |
|---|---|---|
| `events/memberJoin.js` welcome | `if (!config.welcomeChannelId) return` | `if (!isActive(config, "welcome")) return` |
| `events/memberLeave.js` goodbye | `if (config.goodbyeChannelId)` | `if (isActive(config, "goodbye"))` |
| `lib/logger.js` `sendLog` | `if (!channelId) return` | `if (!isActive(config, "logs")) return` (plus the type check, below) |
| `events/messageLogs.js` early return | `!logChannelId` | `!isActive(config, "logs")` |
| `events/honeypot.js` | `!config.honeypotChannelId \|\| ...` | `!isActive(config, "honeypot") \|\| ...` |
| `events/automod.js` skip of honeypot channel | `message.channelId === config.honeypotChannelId` | unchanged: a paused honeypot channel is still a channel nobody should talk in, and automod skipping it is harmless |

The slash commands:

- `/welcome set`, `/goodbye set`, `/logs set` and `/honeypot set` also clear
  their `*Off` flag, so setting a feature up always resumes it.
- `/x disable` clears everything, including the `*Off` flag. That is today's
  behaviour plus the flag.
- `/x show` adds `⏸️ Paused` when the flag is set.

In the dashboard:

- Home status: `on · #ch`, `paused · #ch`, or `off`.
- Section views show `**Status:** ✅ on`, `⏸️ paused`, or `❌ off`.
- `⏸️ Pause` / `▶️ Resume` flip the flag. `Disable` clears channel, text and
  flag.

## 2. Log types

Types: `messages`, `members`, `moderation`, `server`, `voice`. New config key
`logTypesOff`: an array of the type ids that are turned off. It is absent
when all are on.

`sendLog(guild, type, embed, files = [])` takes a new second parameter. It
returns early when logs are inactive or `type` is in `logTypesOff`. All 18
call sites pass a type:

| Type | Call sites |
|---|---|
| messages | messageLogs: deleted, bulk deleted, edited |
| members | memberJoin: joined, roles restored · memberLeave: left · memberUpdate: nickname, roles |
| moderation | bans: ban/unban · memberLeave: kicked · memberUpdate: timeout/removed · automod · honeypot · memberJoin: new account kicked · commands/warn · commands/softban |
| server | serverLogs: channel created/deleted, role created/deleted |
| voice | serverLogs: voice joined/left/switched |

`lib/logger.js` exports `LOG_TYPES`, an ordered list of `{ id, label, emoji }`
used by the dashboard.

The Logs section has these rows:

1. A channel picker.
2. Five type toggles: `💬 Messages`, `👥 Members`, `🛡️ Moderation`,
   `🏠 Server`, `🔊 Voice`. They use `toggleButton`.
3. `⏸️ Pause/▶️ Resume`, `Disable`, `◀ Home`.

## 3. Editable text and previews

| Embed | New config keys | Form fields | Defaults |
|---|---|---|---|
| Welcome | `welcomeTitle` (+ existing `welcomeMessage`) | Title (max 256), Message (max 1000) | title `👋 Welcome to {server}!` |
| Goodbye | `goodbyeTitle` (+ existing `goodbyeMessage`) | Title (max 256), Message (max 1000) | title `👋 Goodbye!` |
| Honeypot warning | `honeypotWarningTitle`, `honeypotWarningText` | Title (max 256), Text (max 2000) | today's title and text |
| FAQ panel | `faqPanelTitle`, `faqPanelText` | Title (max 256), Text (max 2000) | today's title and text |

Placeholders:

- Welcome/goodbye keep `{user} {username} {server} {count}` in both the title
  and the message. In the title, `{user}` is replaced by the username, since
  mentions don't render in embed titles.
- The honeypot warning supports `{action}`, which becomes `kicked`, `banned`,
  or `removed from the server and has their recent messages deleted`.

An empty field means "use the default" and the key is deleted.

Builders take the custom text:

- `buildGreetingEmbed(member, template, joining, title?)` and
  `sendGreeting(member, channelId, template, joining, title?)`. The events
  pass `config.<id>Title`.
- `honeypotWarningEmbed(action, { title, text }?)`.
- `faqPanel(faqs, { title, text }?)`.
- `buildSelfRolePanel(title, description, roles)` is unchanged.

Slash commands that post these embeds (`/honeypot set` with post_warning,
`/faqmanage panel`) use the saved custom text too.

Section changes:

- **Welcome/Goodbye:** the form becomes `✏️ Edit text` with Title + Message.
  Row: `✏️ Edit text`, `👁️ Preview`, `⏸️ Pause/▶️ Resume`, `Disable`, then
  `◀ Home` on its own row. That is 5 buttons, so Home moves to a final row.
- **Honeypot:** rows are
  1. channel picker
  2. action menu
  3. `✏️ Warning text`, `👁️ Preview warning`, `📤 Post warning`
  4. `⏸️ Pause/▶️ Resume`, `Disable`, `◀ Home`
- **FAQ:** rows are
  1. question menu
  2. panel channel picker (posts)
  3. `➕ Add`, `✏️ Edit`, `🗑️ Remove`
  4. `✏️ Panel text`, `👁️ Preview panel`, `◀ Home`

Previews are ephemeral replies showing the exact embed (and components, for
panels) that would be posted. The person clicking stands in for the member in
greeting previews.

## 4. Self-role panel manager

### Storage

`lib/selfRolePanels.js` (new, JSON store `self-role-panels`):
`{ [guildId]: [{ messageId, channelId, title, description, roleIds }] }`.

Functions: `getPanels(guildId)`, `findPanel(guildId, messageId)`,
`savePanel(guildId, panel)` (insert or replace by messageId),
`removePanel(guildId, messageId)`.

`/selfroles` records the panel it posts.

`MAX_SELF_ROLES` becomes 25 for the dashboard. `/selfroles` keeps 10 role
options through a local `SLASH_ROLE_OPTIONS = 10`, because slash commands
allow at most 25 options in total.

### Views

All are rendered by the `selfroles` section, with the view chosen by its
arguments.

**List** (section home):

- Description: how panels work, plus the number of panels.
- Rows:
  1. A panel menu `setup:selfroles:open`, only if panels exist. It lists the
     first 25, labelled `<title> · #<channel name>`, with value messageId.
  2. `➕ New panel`, `🔗 Add existing panel`, `◀ Home`.
- Panels whose message no longer exists are removed from the list when the
  bot tries to edit them, and the user gets a notice.

**New panel** (draft kept with `saveDraft`, id in custom IDs):

1. Channel picker `setup:selfroles:newchannel:<draftId>`, defaulting to the
   channel `/setup` was run in.
2. Role picker `setup:selfroles:newroles:<draftId>` (1–25).
3. `✏️ Text`, `👁️ Preview`, `📤 Post` (disabled until roles and title are
   set).
4. `◀ Back`.

The draft holds `{ channelId, roleIds, title, description }`. The title
defaults to empty, and `📤 Post` stays disabled until a title is set.

**Edit panel** (`messageId` in custom IDs):

1. Role picker `setup:selfroles:roles:<messageId>`, preselected with the
   current roles that still exist. Changing it edits the posted message
   immediately and saves.
2. `✏️ Text` edits the message and saves. `👁️ Preview`. `🗑️ Delete panel`.
3. `◀ Back`, `◀ Home`.

`🗑️ Delete panel` re-renders with a `Confirm delete` (danger) and a
`Cancel` button. Confirming deletes the message (ignoring "already deleted")
and the record.

### Adopting an existing panel

`🔗 Add existing panel` opens a form with one field: the message link
(`https://discord.com/channels/<guild>/<channel>/<message>`, also accepting
`ptb.`/`canary.`). The bot then:

1. Rejects links to another server.
2. Fetches the message.
3. Checks that the bot sent it and that it has `selfrole:<id>` buttons.
4. Reads the role ids from the buttons, the title from the embed title, and
   the description from the embed description up to the role bullet list.
   The role list is the trailing `\n\n• ...` block.
5. Saves the panel and opens its edit view.

Errors are shown as notices on the list view:

- `❌ That link isn't a message in this server.`
- `❌ I can't find that message.`
- `❌ That isn't a self-role panel I posted.`

### Checks

Every role is checked with `checkAssignableRole` before it is posted or
saved. Channel posting uses `missingChannelPermissions(SEND_EMBED_PERMISSIONS)`.

### Self-role button handler

Unchanged: `selfrole:<roleId>` buttons keep working for old and new panels.

## Error handling

The same as v1. Errors are shown as the section notice, never thrown for known
causes. Editing a panel whose message was deleted shows
`❌ That panel's message was deleted, so I removed it from the list.` and
returns to the list.

## Testing

- `lib/features.js`: `isActive` for set, paused and unset, for all four
  features.
- `sendLog`: skipped when paused, skipped when the type is off, sent
  otherwise. Uses a fake guild whose channel records `send`.
- Every changed event check has at least one test: welcome is not sent when
  paused, and honeypot is ignored when paused.
- Sections: Pause/Resume flips the flag and keeps settings. Disable clears
  everything. Log type toggles. Text forms save and empty fields reset.
  Previews reply ephemerally with the custom text.
- Self roles: new panel flow (channel, roles, text, post, record saved);
  editing roles edits the message; deleting with confirm; adopting from a
  link (valid, other server, not the bot's message, no selfrole buttons);
  a deleted message is pruned.
- The generic view test covers all new views: list, new, edit, and delete
  confirm, each with empty and filled data, including 25 roles and 25+
  panels.
- Manual: the Task 10 checks from v1, plus the three open checks from the v1
  review: the emoji, re-picking the same roles, and a deleted saved channel.

## Out of scope

- The `/mod` panel (next spec).
- The v1 deferred minors are not part of this spec unless touched by it:
  - The blank self-role title is now prevented by `📤 Post` being disabled
    without a title, and the text form trims and requires one.
  - The empty Home menu is still open.
  - The Limits Kick Members check is still open.
  - The slow sends are still open.
  - The honeypot re-post hint is now covered by the Preview/Post split.
