const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");

// Loads data/<name>.json into memory and returns { data, save }
function loadJsonFile(name) {
    const file = path.join(DATA_DIR, `${name}.json`);
    let data = {};
    if (fs.existsSync(file)) {
        try {
            data = JSON.parse(fs.readFileSync(file, "utf-8"));
        } catch (err) {
            console.error(`Failed to load ${file}:`, err);
        }
    }
    const save = () => {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    };
    return { data, save };
}

module.exports = { loadJsonFile, DATA_DIR };
