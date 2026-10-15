const { DEFAULT_WELCOME } = require("../../greetings");
const { greetingSection } = require("./greeting");

module.exports = greetingSection({ id: "welcome", label: "Welcome", emoji: "📢", joining: true, defaultMessage: DEFAULT_WELCOME });
