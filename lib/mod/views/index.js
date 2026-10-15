// Every view the /mod panel can route to, by the <view> part of "mod:<view>:<action>[:<arg>]"
const VIEWS = Object.fromEntries([
    require("./home").view,
    require("./user").view,
    require("./bans").view,
    require("./roles").view,
    require("./warnings").view,
    require("./channel").view,
    require("./history").view,
].map(view => [view.id, view]));

module.exports = { VIEWS };
