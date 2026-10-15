const { test, expect } = require("bun:test");
const { buildSelfRolePanel, MAX_SELF_ROLES } = require("../lib/selfRoles");
const { fakeRole } = require("./fakes");

test("allows up to 10 roles", () => {
    expect(MAX_SELF_ROLES).toBe(10);
});

test("10 roles fit in two rows of five buttons", () => {
    const roles = Array.from({ length: 10 }, (_, i) => fakeRole(`r${i}`));
    const { components } = buildSelfRolePanel("Pick roles", null, roles);
    expect(components.map(row => row.components.length)).toEqual([5, 5]);
    expect(components[0].components[0].toJSON().custom_id).toBe("selfrole:r0");
});

test("uses the default description when none is given", () => {
    const { embeds } = buildSelfRolePanel("Pick roles", null, [fakeRole("r1")]);
    const json = embeds[0].toJSON();
    expect(json.title).toBe("Pick roles");
    expect(json.description).toBe("Click a button to get or remove a role.\n\n• <@&r1>");
});
