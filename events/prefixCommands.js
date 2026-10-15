const { Events, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { EMBED_COLOR } = require("../lib/colors");
const { getGuildConfig } = require("../lib/guildConfig");
const { isBlocked } = require("../lib/access");

const DEFAULT_PREFIX = "!";

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

// This server's prefix (changed in /setup → Prefix); DMs always use the default
const prefixFor = guild => (guild && getGuildConfig(guild.id).prefix) || DEFAULT_PREFIX;

module.exports = {
    DEFAULT_PREFIX,
    prefixFor,
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;
        const prefix = prefixFor(message.guild);
        if (!message.content.toLowerCase().startsWith(prefix.toLowerCase())) return;
        const body = message.content.slice(prefix.length);
        const command = body.split(" ")[0].toLowerCase();
        const rest = body.slice(command.length + 1);

        if (body.toLowerCase() === "quote") {
            const quote = clannadQuotes[Math.floor(Math.random() * clannadQuotes.length)];
            const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTitle("🌸 Clannad Quote").setDescription(quote);
            return message.channel.send({ embeds: [embed] });
        }
        if (body.toLowerCase() === "roll") return message.channel.send(`🎲 You rolled ${Math.floor(Math.random() * 6) + 1}!`);
        if (body.toLowerCase() === "coin") return message.channel.send(`🪙 You flipped ${Math.random() < 0.5 ? "Heads" : "Tails"}!`);

        if (command === "choose" && rest) {
            const options = rest.split(",").map(o => o.trim()).filter(Boolean);
            if (options.length < 2) return message.channel.send("❗ Please provide at least two options.");
            const choice = options[Math.floor(Math.random() * options.length)];
            return message.channel.send(`🎯 I choose: **${choice}**`);
        }

        if (command === "number" && rest) {
            const args = rest.split(" ").map(Number);
            if (args.length < 2 || args.some(isNaN)) return message.channel.send(`🔢 Usage: \`${prefix}number [min] [max]\``);
            const [min, max] = args;
            return message.channel.send(`🔢 Your number: **${Math.floor(Math.random() * (max - min + 1)) + min}**`);
        }

        if (command === "say") {
            if (!message.inGuild()) return;
            const asInteraction = { guild: message.guild, member: message.member, user: message.author, memberPermissions: message.member.permissions };
            if (isBlocked(asInteraction, "say")) return message.reply("🔒 You're blocked from using this command here.");
            if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                return message.reply("❌ You don’t have permission to use this command.");
            }
            const args = rest.split(" ").filter(Boolean);
            const channel = message.mentions.channels.first();
            const text = channel ? args.slice(1).join(" ") : args.join(" ");
            if (!text) return message.reply(`Usage: \`${prefix}say [#channel] Your message here\``);
            const target = channel || message.channel;
            try {
                await target.send(text);
                await message.delete().catch(() => {});
            } catch (err) {
                console.error("Say error:", err);
                message.reply("⚠️ Failed to send message.");
            }
        }
    },
};
