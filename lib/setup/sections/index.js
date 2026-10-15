// Order shown on the /setup home page. A new feature gets its own file here and a line below.
const SECTIONS = [
    require("./welcome"),
    require("./goodbye"),
    require("./logs"),
    require("./automod"),
    require("./joinwhitelist"),
    require("./embeds"),
    require("./prefix"),
    require("./botmods"),
    require("./honeypot"),
    require("./autorole"),
    require("./restoreroles"),
    require("./faq"),
    require("./selfroles"),
];

module.exports = { SECTIONS };
