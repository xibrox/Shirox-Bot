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
