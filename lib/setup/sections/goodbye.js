const { DEFAULT_GOODBYE, DEFAULT_GOODBYE_TITLE } = require("../../greetings");
const { greetingSection } = require("./greeting");

module.exports = greetingSection({
    id: "goodbye", label: "Goodbye", emoji: "👋", joining: false, defaultMessage: DEFAULT_GOODBYE, defaultTitle: DEFAULT_GOODBYE_TITLE,
});
