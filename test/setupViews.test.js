const { describe, test, expect } = require("bun:test");
const setup = require("../commands/setup");
const { SECTIONS } = require("../lib/setup/sections");
const { updateGuildConfig } = require("../lib/guildConfig");
const { addFaq } = require("../lib/faq");
const { fakeGuild, fakeInteraction } = require("./fakes");
const { rowsOf, expectWithinDiscordLimits } = require("./limits");
const { savePanel } = require("../lib/selfRolePanels");

const FILLED = {
    welcomeChannelId: "c1", welcomeMessage: "Hi {user}", goodbyeChannelId: "c2", goodbyeMessage: "Bye {username}",
    logChannelId: "c3", automodInvites: true, automodLinks: true, automodSpam: true, automodMentionLimit: 5,
    automodMinAccountAgeDays: 7, honeypotChannelId: "c4", honeypotAction: "ban", autoRoleId: "r1", botAutoRoleId: "r2",
    restoreRoles: true,
    joinWhitelist: true,
    botMods: Array.from({ length: 25 }, (_, i) => ({ type: i % 2 ? "role" : "user", id: `${700000000000000000 + i}`, blocked: ["ban", "kick"] })),
    embedFix: true,
    embedFixHide: true,
    embedFixOrder: { twitter: ["vxtwitter.com"] },
    embedFixOff: ["tiktok"],
    joinWhitelistIds: Array.from({ length: 40 }, (_, i) => `${800000000000000000 + i}`),
    automodInviteAllow: Array.from({ length: 25 }, (_, i) => ({ id: `${900000000000000000 + i}`, name: `Server ${"n".repeat(120)}` })),
};

// Every setting on, plus more (and longer) FAQs than a menu can hold
function filledInteraction() {
    const interaction = fakeInteraction();
    updateGuildConfig(interaction.guild.id, FILLED);
    for (let i = 0; i < 30; i++) addFaq(interaction.guild.id, `Question ${i} ${"x".repeat(180)}`, "Answer");
    for (let i = 0; i < 30; i++) {
        savePanel(interaction.guild.id, {
            messageId: `m${i}`, channelId: "c1", title: `Panel ${i} ${"y".repeat(190)}`, description: null, roleIds: ["r1"],
        });
    }
    return interaction;
}

const SETTINGS = [["empty", () => fakeInteraction()], ["filled", filledInteraction]];
// Every "setup:" id a view produces must reach a section handler
function expectRoutable(payload) {
    for (const row of rowsOf(payload)) {
        for (const { custom_id } of row.components) {
            const [prefix, sectionId] = custom_id.split(":");
            if (prefix !== "setup" || sectionId === "home") continue;
            expect(SECTIONS.find(s => s.id === sectionId)?.handleComponent).toBeFunction();
        }
    }
}

// Saved channels/roles may have been deleted since; menus must not preselect them
test("pickers only preselect channels and roles that still exist", () => {
    const interaction = filledInteraction();
    for (const section of SECTIONS) {
        for (const row of rowsOf(section.view(interaction))) {
            for (const component of row.components) expect(component.default_values).toBeUndefined();
        }
    }
});

test("pickers preselect a saved channel that exists", () => {
    const channel = { id: "live" };
    const interaction = fakeInteraction({ guild: fakeGuild({ channels: [channel] }) });
    updateGuildConfig(interaction.guild.id, { logChannelId: "live" });
    const logs = SECTIONS.find(s => s.id === "logs");
    expect(rowsOf(logs.view(interaction))[0].components[0].default_values).toEqual([{ id: "live", type: "channel" }]);
});

describe("home view", () => {
    for (const [name, make] of SETTINGS) {
        test(`is valid with ${name} settings`, () => {
            const payload = setup.homeView(make());
            expectWithinDiscordLimits(payload);
            expect(rowsOf(payload)[0].components[0].options.map(o => o.value)).toEqual(SECTIONS.map(s => s.id));
        });
    }
});

for (const section of SECTIONS) {
    describe(`${section.label} view`, () => {
        for (const [name, make] of SETTINGS) {
            test(`is valid with ${name} settings`, () => {
                const payload = section.view(make());
                expectWithinDiscordLimits(payload);
                expectRoutable(payload);
                expect(rowsOf(payload).at(-1).components.at(-1).custom_id).toBe("setup:home:show");
            });
        }

        test("has a status line", () => {
            expect(section.status({}, fakeGuild()).length).toBeGreaterThan(0);
        });
    });
}
