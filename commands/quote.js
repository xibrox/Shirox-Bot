const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { EMBED_COLOR } = require('../lib/colors');

module.exports = {
    category: 'fun',
    data: new SlashCommandBuilder()
        .setName('quote')
        .setDescription('Get a random Clannad quote'),
    async execute(interaction) {
        const quotes = [
            "People are born to be happy.",
            "Even if you feel like you're alone, someone out there is always thinking of you.",
            "You shouldn't be afraid of crying. Crying is a way to cleanse your heart.",
            "The world is beautiful, even if it's full of pain and sadness.",
            "Don't lose hope, no matter how small it is.",
            "You should cry while you still can. When you get bigger, sometimes, you can't cry even if you have something you wanna cry about.",
            "The world is beautiful, even when it's filled with sadness and tears.",
            "I want to see you smile, even if it means I have to disappear.",
            "No matter how cold and distant people may become, on the inside something warm and precious always remains, something that never changes. To me, that's what family is like.",
            "Time and titles do not matter in the bonds between people.",
            "The world is beautiful. Even if you're full of tears and sadness, open your eyes. Do what you want to do. Be what you want to be. Find friends. Don't be in a hurry to grow up. Take your time.",
            "He realized that he had lost sight of something important. No matter what turn he took he should have kept singing. Even if his songs couldn't save the world, he could still sing songs for her. Don't ever lose sight of what's important to you.",
            "You're trying to stay unscarred, aren't you? If you've come this far, you'll have to hurt someone. The more time you take to decide, the deeper and more it'll hurt. For all of you.",
            "Nothing can stay unchanged. Fun things… Happy things… They can't possibly remain the same.",
        ];

        const quote = quotes[Math.floor(Math.random() * quotes.length)];
        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle("🌸 Clannad Quote")
            .setDescription(quote);

        await interaction.reply({ embeds: [embed] });
    },
};
