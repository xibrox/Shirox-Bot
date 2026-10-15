// Order shown on the /setup home page. A new feature gets its own file here and a line below.
const SECTIONS = [
    require("./welcome"),
    require("./goodbye"),
    require("./logs"),
    require("./automod"),
    require("./honeypot"),
];

module.exports = { SECTIONS };
