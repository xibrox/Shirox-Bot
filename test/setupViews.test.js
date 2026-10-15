const { describe, test, expect } = require("bun:test");
const setup = require("../commands/setup");
const { SECTIONS } = require("../lib/setup/sections");
const { updateGuildConfig } = require("../lib/guildConfig");
const { addFaq } = require("../lib/faq");
const { fakeGuild, fakeInteraction } = require("./fakes");

const FILLED = {
    welcomeChannelId: "c1", welcomeMessage: "Hi {user}", goodbyeChannelId: "c2", goodbyeMessage: "Bye {username}",
    logChannelId: "c3", automodInvites: true, automodLinks: true, automodSpam: true, automodMentionLimit: 5,
    automodMinAccountAgeDays: 7, honeypotChannelId: "c4", honeypotAction: "ban", autoRoleId: "r1", botAutoRoleId: "r2",
    restoreRoles: true,
};

// Every setting on, plus more (and longer) FAQs than a menu can hold
function filledInteraction() {
    const interaction = fakeInteraction();
    updateGuildConfig(interaction.guild.id, FILLED);
    for (let i = 0; i < 30; i++) addFaq(interaction.guild.id, `Question ${i} ${"x".repeat(180)}`, "Answer");
    return interaction;
}

const SETTINGS = [["empty", () => fakeInteraction()], ["filled", filledInteraction]];
const rowsOf = payload => payload.components.map(row => row.toJSON());

// Discord rejects messages that break these limits with "interaction failed"
function expectWithinDiscordLimits(payload) {
    expect(payload.components.length).toBeLessThanOrEqual(5);
    for (const embed of payload.embeds) expect((embed.toJSON().description ?? "").length).toBeLessThanOrEqual(4096);
    for (const row of rowsOf(payload)) {
        expect(row.components.length).toBeLessThanOrEqual(5);
        for (const component of row.components) {
            expect(component.custom_id.length).toBeLessThanOrEqual(100);
            expect(component.custom_id).toMatch(/^(setup|faqmanage):/);
            if (component.options) expect(component.options.length).toBeLessThanOrEqual(25);
            for (const option of component.options ?? []) expect(option.label.length).toBeLessThanOrEqual(100);
        }
    }
}

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
