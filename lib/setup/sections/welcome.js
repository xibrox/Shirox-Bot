const { DEFAULT_WELCOME, DEFAULT_WELCOME_TITLE } = require("../../greetings");
const { greetingSection } = require("./greeting");

module.exports = greetingSection({
    id: "welcome", label: "Welcome", emoji: "📢", joining: true, defaultMessage: DEFAULT_WELCOME, defaultTitle: DEFAULT_WELCOME_TITLE,
});
