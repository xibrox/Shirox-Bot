const { PermissionFlagsBits } = require('discord.js');
const { buildCommandGroup } = require('../lib/commandGroup');

module.exports = buildCommandGroup({
  name: 'mod',
  description: 'Moderation commands (ban, kick, timeout, warnings, purge...)',
  category: 'moderation',
  defaultPermission: PermissionFlagsBits.ModerateMembers,
  entries: {
    ban: require('./ban'),
    unban: require('./unban'),
    kick: require('./kick'),
    softban: require('./softban'),
    timeout: require('./timeout'),
    warn: require('./warn'),
    warnings: require('./warnings'),
    purge: require('./purge'),
    lock: require('./lock'),
    slowmode: require('./slowmode'),
    role: require('./role'),
    say: require('./say'),
    embed: require('./embed'),
  },
});
