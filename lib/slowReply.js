// Discord drops a click that isn't answered within 3 seconds. Posting or editing messages can take
// longer, so if a handler is still busy after `ms`, acknowledge the click and turn its eventual
// update() into an edit of the same message. Returns a function that ends the guard.
function guardSlowReply(interaction, ms = 2_000) {
    const original = interaction.update;
    const update = original.bind(interaction);
    let acknowledging = null;
    const timer = setTimeout(() => {
        if (interaction.replied || interaction.deferred) return;
        acknowledging = interaction.deferUpdate().catch(() => {});
    }, ms);

    interaction.update = async payload => {
        clearTimeout(timer);
        if (acknowledging) {
            await acknowledging;
            return interaction.editReply(payload);
        }
        return update(payload);
    };
    return () => {
        clearTimeout(timer);
        interaction.update = original;
    };
}

module.exports = { guardSlowReply };
