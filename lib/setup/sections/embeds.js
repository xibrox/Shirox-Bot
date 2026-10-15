const { PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const { getGuildConfig, updateGuildConfig } = require("../../guildConfig");
const { PLATFORMS, settingsFrom, orderFor, isOff, serviceName } = require("../../embedFix");
const { sectionView, buttonRow, toggleButton } = require("../ui");

const orderText = (platform, settings) => orderFor(platform, settings).map(h => serviceName(platform, h)).join(" → ");

// Saves the whole service setup in the current format (replacing the older one-choice-per-platform setting)
function saveSettings(guildId, { order, off }) {
    updateGuildConfig(guildId, { embedFixOrder: Object.keys(order).length ? order : null, embedFixOff: off.length ? off : null, embedFixServices: null });
}

const section = {
    id: "embeds",
    label: "Link embeds",
    emoji: "🖼️",
    command: "embeds",
    permission: PermissionFlagsBits.ManageGuild,

    status: config => (config.embedFix ? "on" : "off"),

    // `platformId` is the platform picked in the first menu, whose service order the second menu changes
    view(interaction, notice, platformId) {
        const config = getGuildConfig(interaction.guild.id);
        const settings = settingsFrom(config);
        const picked = PLATFORMS.find(p => p.id === platformId);
        const description = [
            "Replies to social media posts with links that embed properly. Every service is used in the order below;",
            "whoever posted the link can switch the reply to another service if one doesn't embed.",
            "",
            `**Status:** ${config.embedFix ? "✅ on" : "❌ off"}`,
            `**Hide original embeds:** ${config.embedFixHide ? "✅ on (needs Manage Messages)" : "❌ off"}`,
            "",
            ...PLATFORMS.map(p => `${p.emoji} **${p.label}:** ${isOff(p, settings) ? "❌ off" : orderText(p, settings)}`),
        ].join("\n");

        const rows = [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId("setup:embeds:platform")
            .setPlaceholder("Change a platform's services…")
            .addOptions(PLATFORMS.map(p => ({
                label: p.label, value: p.id, emoji: { name: p.emoji }, default: p.id === picked?.id,
                description: isOff(p, settings) ? "Off" : `First: ${serviceName(p, orderFor(p, settings)[0])}`,
            }))))];
        if (picked) {
            rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
                .setCustomId(`setup:embeds:first:${picked.id}`)
                .setPlaceholder("Move a service to the top…")
                .addOptions(orderFor(picked, settings).map((h, i) => ({ label: `${i + 1}. ${serviceName(picked, h)}`, description: h, value: h })))));
            rows.push(new ActionRowBuilder().addComponents(
                toggleButton(`setup:embeds:platformtoggle:${picked.id}`, picked.label, !isOff(picked, settings)),
            ));
        }
        rows.push(buttonRow(
            toggleButton("setup:embeds:toggle", "Link fixing", !!config.embedFix),
            toggleButton("setup:embeds:hide", "Hide originals", !!config.embedFixHide),
        ));
        return sectionView(section, description, rows, notice);
    },

    async handleComponent(interaction, action, arg) {
        const { guild } = interaction;
        const config = getGuildConfig(guild.id);
        const settings = settingsFrom(config);

        if (action === "platform") return interaction.update(section.view(interaction, undefined, interaction.values[0]));
        if (action === "first" || action === "platformtoggle") {
            const platform = PLATFORMS.find(p => p.id === arg);
            if (!platform) return;
            if (action === "first") {
                const host = interaction.values[0];
                if (!platform.services.some(([h]) => h === host)) return;
                const order = [host, ...orderFor(platform, settings).filter(h => h !== host)];
                saveSettings(guild.id, { ...settings, order: { ...settings.order, [platform.id]: order } });
                return interaction.update(section.view(interaction, `✅ ${platform.label}: ${order.map(h => serviceName(platform, h)).join(" → ")}`, platform.id));
            }
            const turningOff = !isOff(platform, settings);
            const off = turningOff ? [...settings.off, platform.id] : settings.off.filter(id => id !== platform.id);
            saveSettings(guild.id, { ...settings, off });
            return interaction.update(section.view(interaction,
                turningOff ? `❌ ${platform.label} links won't be fixed.` : `✅ ${platform.label} links will be fixed.`, platform.id));
        }
        if (action === "toggle") {
            updateGuildConfig(guild.id, { embedFix: config.embedFix ? null : true });
            return interaction.update(section.view(interaction, config.embedFix ? "❌ Link fixing off." : "✅ Link fixing on."));
        }
        if (action === "hide") {
            updateGuildConfig(guild.id, { embedFixHide: config.embedFixHide ? null : true });
            const warning = !config.embedFixHide && !guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)
                ? " Give me **Manage Messages** so I can hide them." : "";
            return interaction.update(section.view(interaction, `${config.embedFixHide ? "❌" : "✅"} Hide original embeds ${config.embedFixHide ? "off" : "on"}.${warning}`));
        }
    },
};

module.exports = section;
