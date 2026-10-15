const { PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const { getGuildConfig, updateGuildConfig } = require("../../guildConfig");
const { PLATFORMS, serviceFor } = require("../../embedFix");
const { sectionView, buttonRow, toggleButton } = require("../ui");

const serviceName = (platform, host) => (host === "off" ? "off" : platform.services.find(([h]) => h === host)?.[1] ?? host);

const section = {
    id: "embeds",
    label: "Link embeds",
    emoji: "🖼️",
    permission: PermissionFlagsBits.ManageGuild,

    status: config => (config.embedFix ? "on" : "off"),

    // `platformId` is the platform picked in the first menu, whose services the second menu shows
    view(interaction, notice, platformId) {
        const config = getGuildConfig(interaction.guild.id);
        const choices = config.embedFixServices ?? {};
        const picked = PLATFORMS.find(p => p.id === platformId);
        const description = [
            "Replies to social media posts with links that embed properly.",
            "",
            `**Status:** ${config.embedFix ? "✅ on" : "❌ off"}`,
            `**Hide original embeds:** ${config.embedFixHide ? "✅ on (needs Manage Messages)" : "❌ off"}`,
            "",
            ...PLATFORMS.map(p => `${p.emoji} **${p.label}:** ${serviceName(p, serviceFor(p, choices))}`),
        ].join("\n");

        const rows = [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId("setup:embeds:platform")
            .setPlaceholder("Change a platform's service…")
            .addOptions(PLATFORMS.map(p => ({
                label: p.label, value: p.id, emoji: { name: p.emoji },
                description: `Now: ${serviceName(p, serviceFor(p, choices))}`, default: p.id === picked?.id,
            }))))];
        if (picked) {
            const current = serviceFor(picked, choices);
            rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
                .setCustomId(`setup:embeds:service:${picked.id}`)
                .setPlaceholder(`Service for ${picked.label}…`)
                .addOptions(
                    ...picked.services.map(([host, name]) => ({ label: name, description: host, value: host, default: host === current })),
                    { label: "Off", description: `Don't fix ${picked.label} links`, value: "off", default: current === "off" },
                )));
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

        if (action === "platform") return interaction.update(section.view(interaction, undefined, interaction.values[0]));
        if (action === "service") {
            const platform = PLATFORMS.find(p => p.id === arg);
            const host = interaction.values[0];
            if (!platform || (host !== "off" && !platform.services.some(([h]) => h === host))) return;
            updateGuildConfig(guild.id, { embedFixServices: { ...config.embedFixServices, [platform.id]: host } });
            return interaction.update(section.view(interaction, `✅ ${platform.label}: ${serviceName(platform, host)}`, platform.id));
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
