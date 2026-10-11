const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const { EMBED_COLOR } = require('../lib/colors');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Shows all available commands')
        .addStringOption(option =>
            option.setName('category')
                .setDescription('Command category to show')
                .setRequired(false)
                .addChoices(
                    { name: 'Fun', value: 'fun' },
                    { name: 'Utility', value: 'utility' },
                    { name: 'Moderation', value: 'moderation' },
                    { name: 'Setup', value: 'setup' }
                )),

    async execute(interaction) {
        const category = interaction.options.getString('category');
        const isAdmin = !!interaction.member?.permissions.has(PermissionsBitField.Flags.ManageMessages);

        const commands = {
            fun: {
                title: "🎮 Fun Commands",
                commands: [
                    { name: "quote", description: "Get a random Clannad quote", usage: "/quote" },
                    { name: "roll", description: "Roll a dice (1-6)", usage: "/roll" },
                    { name: "coin", description: "Flip a coin", usage: "/coin" },
                    { name: "sadscale", description: "Get your current sadness level", usage: "/sadscale" },
                    { name: "kotomi-violin", description: "Display Kotomi's violin gif", usage: "/kotomi-violin" }
                ]
            },
            utility: {
                title: "🛠️ Utility Commands",
                commands: [
                    { name: "choose", description: "Choose between multiple options", usage: "/choose [options]" },
                    { name: "pick", description: "Pick a random server member", usage: "/pick" },
                    { name: "number", description: "Generate a random number", usage: "/number [min] [max]" },
                    { name: "remindme", description: "Set a reminder", usage: "/remindme [time] [message]" },
                    { name: "userinfo", description: "Show information about a user", usage: "/userinfo [user]" },
                    { name: "serverinfo", description: "Show information about this server", usage: "/serverinfo" },
                    { name: "avatar", description: "Show a user's avatar", usage: "/avatar [user]" },
                    { name: "ping", description: "Check the bot's latency", usage: "/ping" },
                    ...(isAdmin ? [{ name: "say", description: "Make the bot say something", usage: "/say [#channel] [message]" }] : [])
                ]
            },
            moderation: {
                title: "🛡️ Moderation Commands",
                commands: [
                    { name: "purge", description: "Bulk delete messages, optionally from one user or of one kind", usage: "/purge [amount] [user] [filter]" },
                    { name: "kick", description: "Kick a member", usage: "/kick [user] [reason]" },
                    { name: "ban", description: "Ban a user (works even if they left)", usage: "/ban [user] [reason] [delete_messages]" },
                    { name: "unban", description: "Unban a user by ID", usage: "/unban [user_id] [reason]" },
                    { name: "timeout", description: "Timeout a member, or use `off` to remove it", usage: "/timeout [user] [duration] [reason]" },
                    { name: "slowmode", description: "Set this channel's slowmode", usage: "/slowmode [duration|off]" },
                    { name: "lock", description: "Lock or unlock this channel", usage: "/lock [unlock] [reason]" },
                    { name: "role", description: "Add or remove a role from a member", usage: "/role add|remove [user] [role]" },
                    { name: "warn", description: "Warn a member (they get a DM)", usage: "/warn [user] [reason]" },
                    { name: "warnings", description: "List, remove or clear a member's warnings", usage: "/warnings list|remove|clear [user]" }
                ],
                hidden: true
            },
            setup: {
                title: "⚙️ Setup Commands",
                commands: [
                    { name: "autorole", description: "Automatically give a role to new members (or bots)", usage: "/autorole set|disable|show" },
                    { name: "welcome", description: "Send a welcome message when someone joins", usage: "/welcome set|disable|show", note: "Placeholders: {user} {username} {server} {count}" },
                    { name: "goodbye", description: "Send a message when someone leaves", usage: "/goodbye set|disable|show", note: "Placeholders: {user} {username} {server} {count}" },
                    { name: "logs", description: "Log messages, joins/leaves, bans, kicks, timeouts, roles, voice and more", usage: "/logs set|disable|show" },
                    { name: "honeypot", description: "Trap channel: anyone who posts there is soft banned (catches hacked accounts)", usage: "/honeypot set|disable|show" },
                    { name: "automod", description: "Block invites/links, mass mentions, spam and brand-new accounts", usage: "/automod invites|links|mentions|spam|new_accounts|show" },
                    { name: "selfroles", description: "Post buttons members click to get roles", usage: "/selfroles [title] [role1] ... [role10]" }
                ],
                hidden: true
            }
        };

        const embedColor = {
            fun: "#FF69B4", // Pink
            utility: "#4CAF50", // Green
            moderation: "#E74C3C", // Red
            setup: "#F1C40F" // Yellow
        };

        // If a specific category is requested
        if (category) {
            const categoryData = commands[category];
            if (!categoryData) {
                return interaction.reply({ content: "❌ Invalid category!", ephemeral: true });
            }

            // Hide moderation for normal users
            if (categoryData.hidden && !isAdmin) {
                return interaction.reply({ content: "❌ You do not have permission to view this category.", ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle(categoryData.title)
                .setColor(embedColor[category])
                .setDescription(categoryData.commands.map(cmd =>
                    `**${cmd.name}**\n📝 ${cmd.description}\n🔧 Usage: \`${cmd.usage}\`${cmd.note ? `\n⚠️ ${cmd.note}` : ''}\n`
                ).join('\n'));

            return interaction.reply({ embeds: [embed] });
        }

        // If no category specified, show all visible categories
        const embed = new EmbedBuilder()
            .setTitle("✨ Shirox Bot Help Menu")
            .setColor(EMBED_COLOR)
            .setDescription("Use `/help [category]` to see detailed information about specific categories.");

        const fields = [
            { name: "🎮 Fun", value: "Entertainment commands\n`/help fun`", inline: true },
            { name: "🛠️ Utility", value: "Useful tools and features\n`/help utility`", inline: true },
        ];

        // Only show Moderation field if user is admin
        if (isAdmin) {
            fields.push({ name: "🛡️ Moderation", value: "Moderation commands\n`/help moderation`", inline: true });
            fields.push({ name: "⚙️ Setup", value: "Logs, honeypot, welcome/goodbye & more\n`/help setup`", inline: true });
        }

        embed.addFields(fields)
            .setFooter({ text: "Both slash commands (/) and message commands (!) are supported" });

        await interaction.reply({ embeds: [embed] });
    },
};
