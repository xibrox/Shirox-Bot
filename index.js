require("dotenv").config();
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const {
    Client,
    Collection,
    Events,
    GatewayIntentBits,
    Partials,
    MessageFlags,
} = require("discord.js");
const { getGuildConfig } = require("./lib/guildConfig");
const { isOwner } = require("./lib/owner");
const { COMMAND_KEYS, isBlocked } = require("./lib/access");

const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("Bot is alive!"));
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

const token = process.env.DISCORD_TOKEN;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.DirectMessages,
    ],
    // Partials let delete/edit/leave events fire for things that weren't cached
    partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
});

// ===== Command Loader =====
client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands");
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ("data" in command && "execute" in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing "data" or "execute".`);
        }
    }
}

// ===== Event Loader (logging, honeypot, automod, joins) =====
// Events can also own buttons/menus on the messages they post ("<componentPrefix>:<data>")
const componentHandlers = new Map();
const eventsPath = path.join(__dirname, "events");
for (const file of fs.readdirSync(eventsPath).filter(file => file.endsWith(".js"))) {
    for (const event of [].concat(require(path.join(eventsPath, file)))) {
        if (event.componentPrefix) componentHandlers.set(event.componentPrefix, event);
        const run = (...args) => event.execute(...args).catch(err => console.error(`Error in ${file} (${event.name}):`, err));
        if (event.once) client.once(event.name, run);
        else client.on(event.name, run);
    }
}

// ===== Slash Commands, Right-click Apps, Buttons, Menus & Forms =====
// Buttons, dropdowns and forms use customIds like "<command>:<data>" and are routed back to that command
const COMPONENT_ALIASES = { selfrole: "selfroles" };

const OWNER_ONLY_REPLY = { content: "🔒 Only the bot owner can use this.", flags: MessageFlags.Ephemeral };

async function replyWithError(interaction) {
    const errorMsg = { content: "There was an error executing this command!", flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) await interaction.followUp(errorMsg).catch(() => {});
    else await interaction.reply(errorMsg).catch(() => {});
}

client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            if (command?.ownerOnly && !isOwner(interaction.user.id)) return await interaction.respond([]);
            return await command?.autocomplete?.(interaction);
        }

        if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
            const prefix = interaction.customId.split(":")[0];
            const command = client.commands.get(COMPONENT_ALIASES[prefix] ?? prefix) ?? componentHandlers.get(prefix);
            if (command?.ownerOnly && !isOwner(interaction.user.id)) return await interaction.reply(OWNER_ONLY_REPLY);
            const handler = interaction.isModalSubmit() ? command?.handleModal : command?.handleComponent;
            if (handler) await handler.call(command, interaction);
            return;
        }

        if (!interaction.isChatInputCommand() && !interaction.isContextMenuCommand()) return;
        const command = client.commands.get(interaction.commandName);
        if (!command) {
            // Commands were deployed but this running copy of the bot doesn't have the file (restart/update it)
            console.error(`No command found: ${interaction.commandName}`);
            return await interaction.reply({ content: "⚠️ This command isn't loaded yet. The bot needs to be updated and restarted.", flags: MessageFlags.Ephemeral });
        }
        if (command.ownerOnly && !isOwner(interaction.user.id)) return await interaction.reply(OWNER_ONLY_REPLY);
        // guildId without a cached guild means the bot user isn't in this server (only the app's commands were added)
        if (command.data.dm_permission === false && interaction.guildId && !interaction.guild) {
            return await interaction.reply({
                content: "❌ I'm not actually in this server, only my commands are. Re-invite me with `/invite` so I can work here.",
                flags: MessageFlags.Ephemeral,
            });
        }
        // Bot mods can be blocked from commands in /setup → Bot mods, even if Discord lets them run it
        if (interaction.inGuild() && COMMAND_KEYS.includes(command.data.name) && isBlocked(interaction, command.data.name)) {
            return await interaction.reply({ content: "🔒 You're blocked from using this command here.", flags: MessageFlags.Ephemeral });
        }
        await command.execute(interaction);
    } catch (error) {
        console.error(`Interaction error (${interaction.commandName ?? interaction.customId}):`, error);
        if (!interaction.isAutocomplete()) await replyWithError(interaction);
    }
});

// ===== Ready Event =====
client.once(Events.ClientReady, async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    client.user.setActivity("/help");

    // Role restore needs to know members' roles when they leave, so cache those servers' members
    for (const guild of client.guilds.cache.values()) {
        if (getGuildConfig(guild.id).restoreRoles) {
            await guild.members.fetch().catch(err => console.error(`Failed to fetch members of ${guild.name}:`, err.message));
        }
    }
});

client.login(token);
