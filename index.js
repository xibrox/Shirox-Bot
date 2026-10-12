require("dotenv").config();
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const {
    Client,
    Collection,
    Events,
    GatewayIntentBits,
    EmbedBuilder,
    Partials,
} = require("discord.js");
const { EMBED_COLOR } = require("./lib/colors");
const { getGuildConfig } = require("./lib/guildConfig");

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
const eventsPath = path.join(__dirname, "events");
for (const file of fs.readdirSync(eventsPath).filter(file => file.endsWith(".js"))) {
    for (const event of [].concat(require(path.join(eventsPath, file)))) {
        const run = (...args) => event.execute(...args).catch(err => console.error(`Error in ${file} (${event.name}):`, err));
        if (event.once) client.once(event.name, run);
        else client.on(event.name, run);
    }
}

// ===== Slash Commands, Right-click Apps, Buttons, Menus & Forms =====
// Buttons, dropdowns and forms use customIds like "<command>:<data>" and are routed back to that command
const COMPONENT_ALIASES = { selfrole: "selfroles" };

async function replyWithError(interaction) {
    const errorMsg = { content: "There was an error executing this command!", ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(errorMsg).catch(() => {});
    else await interaction.reply(errorMsg).catch(() => {});
}

client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            return await command?.autocomplete?.(interaction);
        }

        if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
            const prefix = interaction.customId.split(":")[0];
            const command = client.commands.get(COMPONENT_ALIASES[prefix] ?? prefix);
            const handler = interaction.isModalSubmit() ? command?.handleModal : command?.handleComponent;
            if (handler) await handler.call(command, interaction);
            return;
        }

        if (!interaction.isChatInputCommand() && !interaction.isContextMenuCommand()) return;
        const command = client.commands.get(interaction.commandName);
        if (!command) return console.error(`No command found: ${interaction.commandName}`);
        await command.execute(interaction);
    } catch (error) {
        console.error(`Interaction error (${interaction.commandName ?? interaction.customId}):`, error);
        if (!interaction.isAutocomplete()) await replyWithError(interaction);
    }
});

// ===== CLANNAD Quotes =====
const clannadQuotes = [
    "People are born to be happy.",
    "Even if you feel like you're alone, someone out there is always thinking of you.",
    "You shouldn’t be afraid of crying. Crying is a way to cleanse your heart.",
    "The world is beautiful, even if it’s full of pain and sadness.",
    "Don’t lose hope, no matter how small it is.",
    "You should cry while you still can. When you get bigger, sometimes, you can't cry even if you have something you wanna cry about.",
    "The world is beautiful, even when it’s filled with sadness and tears.",
    "I want to see you smile, even if it means I have to disappear.",
    "No matter how cold and distant people may become, on the inside something warm and precious always remains, something that never changes. To me, that’s what family is like.",
    "Time and titles do not matter in the bonds between people.",
    "He realized that he had lost sight of something important. Even if his songs couldn’t save the world, he could still sing songs for her.",
];

// ===== Ready Event =====
client.once("ready", async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    client.user.setActivity("/help");

    // Role restore needs to know members' roles when they leave, so cache those servers' members
    for (const guild of client.guilds.cache.values()) {
        if (getGuildConfig(guild.id).restoreRoles) {
            await guild.members.fetch().catch(err => console.error(`Failed to fetch members of ${guild.name}:`, err.message));
        }
    }
});

// ===== Message Handler =====
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    const msg = message.content.toLowerCase();

    // ===== Fun Commands =====
    if (msg === "!quote") {
        const quote = clannadQuotes[Math.floor(Math.random() * clannadQuotes.length)];
        const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTitle("🌸 Clannad Quote").setDescription(quote);
        return message.channel.send({ embeds: [embed] });
    }

    if (msg === "!roll") return message.channel.send(`🎲 You rolled ${Math.floor(Math.random() * 6) + 1}!`);
    if (msg === "!coin") return message.channel.send(`🪙 You flipped ${Math.random() < 0.5 ? "Heads" : "Tails"}!`);

    if (msg.startsWith("!choose ")) {
        const options = message.content.slice(8).split(",").map(o => o.trim()).filter(Boolean);
        if (options.length < 2) return message.channel.send("❗ Please provide at least two options.");
        const choice = options[Math.floor(Math.random() * options.length)];
        return message.channel.send(`🎯 I choose: **${choice}**`);
    }

    if (msg.startsWith("!number ")) {
        const args = message.content.slice(8).split(" ").map(Number);
        if (args.length < 2 || args.some(isNaN)) return message.channel.send("🔢 Usage: `!number [min] [max]`");
        const [min, max] = args;
        return message.channel.send(`🔢 Your number: **${Math.floor(Math.random() * (max - min + 1)) + min}**`);
    }

    // ===== !say Command =====
    if (message.content.startsWith("!say")) {
        if (!message.inGuild()) return;
        if (!message.member.permissions.has("ManageMessages")) return message.reply("❌ You don’t have permission to use this command.");
        const args = message.content.split(" ").slice(1);
        const channel = message.mentions.channels.first();
        const text = channel ? args.slice(1).join(" ") : args.join(" ");
        if (!text) return message.reply("Usage: `!say [#channel] Your message here`");
        const target = channel || message.channel;
        try {
            await target.send(text);
            await message.delete().catch(() => {});
        } catch (err) {
            console.error("Say error:", err);
            message.reply("⚠️ Failed to send message.");
        }
    }
});

client.login(token);
