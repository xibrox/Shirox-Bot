const { PermissionFlagsBits } = require('discord.js');
const { buildCommandGroup } = require('../lib/commandGroup');

module.exports = buildCommandGroup({
  name: 'setup',
  description: 'Set up the bot for this server (welcome, logs, honeypot, automod...)',
  category: 'setup',
  defaultPermission: PermissionFlagsBits.ManageGuild,
  entries: {
    welcome: require('./welcome'),
    goodbye: require('./goodbye'),
    honeypot: require('./honeypot'),
    automod: require('./automod'),
    logs: require('./logs'),
    autorole: require('./autorole'),
    faq: require('./faqmanage'),
    restoreroles: require('./restoreroles'),
    selfroles: require('./selfroles'),
  },
});
