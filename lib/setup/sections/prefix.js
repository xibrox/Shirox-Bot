const { PermissionFlagsBits, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { getGuildConfig, updateGuildConfig } = require("../../guildConfig");
const { DEFAULT_PREFIX } = require("../../../events/prefixCommands");
const { sectionView, buttonRow, button } = require("../ui");

const prefixOf = config => config.prefix || DEFAULT_PREFIX;

const section = {
    id: "prefix",
    label: "Prefix",
    emoji: "⌨️",
    command: "prefix",
    permission: PermissionFlagsBits.ManageGuild,

    status: config => `\`${prefixOf(config)}\``,

    view(interaction, notice) {
        const prefix = prefixOf(getGuildConfig(interaction.guild.id));
        const description = [
            "The prefix for text commands. Slash commands always start with `/`.",
            "",
            `**Prefix:** \`${prefix}\`${prefix === DEFAULT_PREFIX ? " (default)" : ""}`,
            `**Commands:** ${["quote", "roll", "coin", "choose", "number", "say"].map(c => `\`${prefix}${c}\``).join(" ")}`,
        ].join("\n");
        return sectionView(section, description, [
            buttonRow(
                button("setup:prefix:change", "✏️ Change prefix"),
                button("setup:prefix:reset", `Reset to ${DEFAULT_PREFIX}`).setDisabled(prefix === DEFAULT_PREFIX),
            ),
        ], notice);
    },

    async handleComponent(interaction, action) {
        if (action === "change") {
            const input = new TextInputBuilder()
                .setCustomId("prefix").setLabel("New prefix (1-5 characters, no spaces)").setStyle(TextInputStyle.Short)
                .setRequired(true).setMaxLength(5).setValue(prefixOf(getGuildConfig(interaction.guild.id)));
            return interaction.showModal(new ModalBuilder()
                .setCustomId("setup:prefix:change").setTitle("Change prefix")
                .addComponents(new ActionRowBuilder().addComponents(input)));
        }
        if (action === "reset") {
            updateGuildConfig(interaction.guild.id, { prefix: null });
            return interaction.update(section.view(interaction, `✅ Prefix reset to \`${DEFAULT_PREFIX}\`.`));
        }
    },

    async handleModal(interaction, action) {
        if (action !== "change") return;
        const prefix = interaction.fields.getTextInputValue("prefix").trim();
        if (!/^\S{1,5}$/.test(prefix)) {
            return interaction.update(section.view(interaction, "❌ The prefix must be 1 to 5 characters with no spaces."));
        }
        updateGuildConfig(interaction.guild.id, { prefix: prefix === DEFAULT_PREFIX ? null : prefix });
        return interaction.update(section.view(interaction, `✅ Prefix set to \`${prefix}\`. Try \`${prefix}roll\`.`));
    },
};

module.exports = section;
