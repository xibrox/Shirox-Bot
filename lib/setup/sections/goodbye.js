const { DEFAULT_GOODBYE } = require("../../greetings");
const { greetingSection } = require("./greeting");

module.exports = greetingSection({ id: "goodbye", label: "Goodbye", emoji: "👋", joining: false, defaultMessage: DEFAULT_GOODBYE });
