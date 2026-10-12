const avatar = require('./avatar');

// Same as /avatar, under the name people often look for
module.exports = {
  category: 'utility',
  data: avatar.buildCommand('pfp', "Show a user's profile picture, server avatar or banner"),
  execute: avatar.execute,
};
