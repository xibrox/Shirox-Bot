const { expect } = require("bun:test");

const rowsOf = payload => payload.components.map(row => row.toJSON());

// Discord rejects messages that break these limits with "interaction failed"
function expectWithinDiscordLimits(payload, idPattern = /^(setup|faqmanage):/) {
    expect(payload.components.length).toBeLessThanOrEqual(5);
    for (const embed of payload.embeds) {
        const json = embed.toJSON();
        expect((json.description ?? "").length).toBeLessThanOrEqual(4096);
        for (const field of json.fields ?? []) expect(field.value.length).toBeLessThanOrEqual(1024);
    }
    for (const row of rowsOf(payload)) {
        expect(row.components.length).toBeLessThanOrEqual(5);
        for (const component of row.components) {
            expect(component.custom_id.length).toBeLessThanOrEqual(100);
            expect(component.custom_id).toMatch(idPattern);
            if (component.options) {
                expect(component.options.length).toBeGreaterThan(0);
                expect(component.options.length).toBeLessThanOrEqual(25);
            }
            for (const option of component.options ?? []) expect(option.label.length).toBeLessThanOrEqual(100);
            if (component.label) expect(component.label.length).toBeLessThanOrEqual(80);
        }
    }
}

module.exports = { rowsOf, expectWithinDiscordLimits };
