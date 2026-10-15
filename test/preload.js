const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Tests save settings through the real stores; keep them out of the bot's data/ folder
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "shirox-test-"));
