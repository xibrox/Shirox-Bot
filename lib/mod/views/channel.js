const {
    PermissionFlagsBits: P, ButtonStyle, ChannelType, ActionRowBuilder, ChannelSelectMenuBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle,
} = require("discord.js");
const actions = require("../../modActions");
const { formatDuration } = require("../../duration");
const { button, homeButton, rowOf, modEmbed, panel, can, finishAction } = require("../ui");

const isLocked = (interaction, channel) =>
    !!channel.permissionOverwrites?.cache.get(interaction.guild.roles.everyone.id)?.deny.has(P.SendMessages);

async function channelView(interaction, channelId, notice) {
    const channel = interaction.guild.channels.cache.get(channelId) ?? interaction.channel;
    const locked = isLocked(interaction, channel);
    const slowmode = channel.rateLimitPerUser ?? 0;
    const embed = modEmbed("💬 Channel tools").setDescription([
        `**Channel:** ${channel}`,
        `**Locked:** ${locked ? "yes" : "no"}`,
        `**Slowmode:** ${slowmode ? formatDuration(slowmode * 1000) : "off"}`,
    ].join("\n"));
    const id = channel.id;
    return panel(embed, [
        new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder()
            .setCustomId("mod:channel:pick")
            .setPlaceholder("Pick another channel…")
            .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setDefaultChannels([id])),
        rowOf(
            can(interaction, P.ManageMessages) && button(`mod:channel:purge:${id}`, "🧹 Purge"),
            can(interaction, P.ManageChannels) && (locked
                ? button(`mod:channel:unlock:${id}`, "🔓 Unlock", ButtonStyle.Success)
                : button(`mod:channel:lock:${id}`, "🔒 Lock", ButtonStyle.Danger)),
            can(interaction, P.ManageChannels) && button(`mod:channel:slowmode:${id}`, "🐌 Slowmode"),
            homeButton(),
        ),
    ], notice);
}

const field = (id, label, required, max, placeholder) => {
    const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(required).setMaxLength(max);
    if (placeholder) input.setPlaceholder(placeholder);
    return new ActionRowBuilder().addComponents(input);
};

const FORMS = {
    purge: ["Purge messages", [field("amount", "How many messages (1-100)", true, 3), field("user", "Only from this user ID (optional)", false, 20)]],
    lock: ["Lock channel", [field("reason", "Reason (optional)", false, 400)]],
    unlock: ["Unlock channel", [field("reason", "Reason (optional)", false, 400)]],
    slowmode: ["Slowmode", [field("duration", "Delay between messages", true, 10, "5s, 1m, 1h or off")]],
};

module.exports = {
    view: {
        id: "channel",
        actions: { show: null, pick: null, purge: P.ManageMessages, lock: P.ManageChannels, unlock: P.ManageChannels, slowmode: P.ManageChannels },

        async handleComponent(interaction, action, channelId) {
            if (action === "show") return interaction.update(await channelView(interaction, channelId ?? interaction.channelId));
            if (action === "pick") return interaction.update(await channelView(interaction, interaction.values[0]));
            const [title, fields] = FORMS[action] ?? [];
            if (!title) return;
            return interaction.showModal(new ModalBuilder().setCustomId(`mod:channel:${action}:${channelId}`).setTitle(title).addComponents(...fields));
        },

        async handleModal(interaction, action, channelId) {
            const channel = interaction.guild.channels.cache.get(channelId);
            const render = notice => channelView(interaction, channelId, notice);
            if (!channel) return interaction.update(await channelView(interaction, interaction.channelId, "❌ I can't see that channel."));

            let result;
            if (action === "purge") {
                const amount = Number(interaction.fields.getTextInputValue("amount").trim());
                const userId = interaction.fields.getTextInputValue("user").trim() || null;
                if (!Number.isInteger(amount) || amount < 1 || amount > 100) result = { error: "❌ The amount must be a number from 1 to 100." };
                else if (userId && !/^\d{17,20}$/.test(userId)) result = { error: "❌ That is not a valid user ID." };
                else result = await actions.purgeMessages(interaction, channel, amount, userId);
            } else if (action === "lock" || action === "unlock") {
                result = await actions.setLock(interaction, channel, action === "lock", interaction.fields.getTextInputValue("reason").trim() || null);
            } else if (action === "slowmode") {
                result = await actions.setSlowmode(interaction, channel, interaction.fields.getTextInputValue("duration"));
            } else return;
            // Lock and slowmode announce themselves in the channel they change
            return finishAction(interaction, result, render, channel);
        },
    },
};
