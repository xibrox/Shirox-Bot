const { test, expect } = require("bun:test");
const path = require("node:path");
const { DATA_DIR } = require("../lib/jsonFile");

test("tests never write to the bot's data folder", () => {
    expect(DATA_DIR).toBe(process.env.DATA_DIR);
    expect(DATA_DIR).not.toBe(path.join(__dirname, "..", "data"));
});
