const { test, expect, mock } = require("bun:test");
const { guardSlowReply } = require("../lib/slowReply");
const { fakeInteraction } = require("./fakes");

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function withDefer(interaction) {
    interaction.deferUpdate = mock(async () => { await wait(5); interaction.deferred = true; });
    interaction.editReply = mock(async () => {});
    return interaction;
}

test("a slow handler is acknowledged in time and its update arrives as an edit", async () => {
    const interaction = withDefer(fakeInteraction());
    const originalUpdate = interaction.update;
    guardSlowReply(interaction, 10);
    await wait(30);
    await interaction.update({ content: "✅ posted" });
    expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).toHaveBeenCalledWith({ content: "✅ posted" });
    expect(originalUpdate).not.toHaveBeenCalled();
});

test("an update that lands while acknowledging still becomes an edit", async () => {
    const interaction = withDefer(fakeInteraction());
    guardSlowReply(interaction, 10);
    await wait(12);
    await interaction.update({ content: "late" });
    expect(interaction.editReply).toHaveBeenCalledWith({ content: "late" });
});

test("a fast handler updates normally", async () => {
    const interaction = withDefer(fakeInteraction());
    const originalUpdate = interaction.update;
    const done = guardSlowReply(interaction, 50);
    await interaction.update({ content: "quick" });
    done();
    await wait(60);
    expect(originalUpdate).toHaveBeenCalledWith({ content: "quick" });
    expect(interaction.deferUpdate).not.toHaveBeenCalled();
});
