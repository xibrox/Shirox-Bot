const { describe, test, expect, mock } = require("bun:test");
const prefixCommands = require("../events/prefixCommands");
const setup = require("../commands/setup");
const { getGuildConfig, updateGuildConfig } = require("../lib/guildConfig");
const { fakeGuild, fakeInteraction } = require("./fakes");

function message(guild, content) {
    return {
        content,
        author: { bot: false },
        guild,
        inGuild: () => !!guild,
        channel: { send: mock(async () => {}) },
        reply: mock(async () => {}),
    };
}

describe("prefix commands", () => {
    test("use ! by default", async () => {
        const msg = message(fakeGuild(), "!coin");
        await prefixCommands.execute(msg);
        expect(msg.channel.send.mock.calls[0][0]).toMatch(/^🪙 You flipped (Heads|Tails)!$/);
    });

    test("follow the server's prefix", async () => {
        const guild = fakeGuild();
        updateGuildConfig(guild.id, { prefix: "?" });
        const old = message(guild, "!coin");
        await prefixCommands.execute(old);
        expect(old.channel.send).not.toHaveBeenCalled();

        const roll = message(guild, "?roll");
        await prefixCommands.execute(roll);
        expect(roll.channel.send.mock.calls[0][0]).toMatch(/^🎲 You rolled [1-6]!$/);
    });

    test("work in DMs with !", async () => {
        const msg = message(null, "!choose a, b");
        await prefixCommands.execute(msg);
        expect(msg.channel.send.mock.calls[0][0]).toMatch(/^🎯 I choose: \*\*(a|b)\*\*$/);
    });
});

describe("prefix section", () => {
    const update = interaction => interaction.update.mock.calls.at(-1)[0];

    test("a new prefix is saved", async () => {
        const interaction = fakeInteraction({ customId: "setup:prefix:change", fields: { prefix: " ? " } });
        await setup.handleModal(interaction);
        expect(getGuildConfig(interaction.guild.id).prefix).toBe("?");
        expect(update(interaction).content).toBe("✅ Prefix set to `?`. Try `?roll`.");
    });

    test("prefixes with spaces or over 5 characters are refused", async () => {
        for (const prefix of ["a b", "toolong"]) {
            const interaction = fakeInteraction({ customId: "setup:prefix:change", fields: { prefix } });
            await setup.handleModal(interaction);
            expect(getGuildConfig(interaction.guild.id).prefix).toBeUndefined();
            expect(update(interaction).content).toBe("❌ The prefix must be 1 to 5 characters with no spaces.");
        }
    });

    test("Reset goes back to !", async () => {
        const interaction = fakeInteraction({ customId: "setup:prefix:reset" });
        updateGuildConfig(interaction.guild.id, { prefix: "?" });
        await setup.handleComponent(interaction);
        expect(getGuildConfig(interaction.guild.id).prefix).toBeUndefined();
    });
});
