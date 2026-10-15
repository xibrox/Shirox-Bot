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
