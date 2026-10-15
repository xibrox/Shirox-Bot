// Features that post to a channel; each can be paused without losing its settings
const FEATURES = {
    welcome: { channelKey: "welcomeChannelId", offKey: "welcomeOff" },
    goodbye: { channelKey: "goodbyeChannelId", offKey: "goodbyeOff" },
    logs: { channelKey: "logChannelId", offKey: "logsOff" },
    honeypot: { channelKey: "honeypotChannelId", offKey: "honeypotOff" },
};

// "on", "paused" (channel set but paused) or "off" (no channel)
function featureState(config, feature) {
    const { channelKey, offKey } = FEATURES[feature];
    if (!config[channelKey]) return "off";
    return config[offKey] ? "paused" : "on";
}

const isActive = (config, feature) => featureState(config, feature) === "on";

module.exports = { FEATURES, isActive, featureState };
