async function test(a) {
  for (var i in a) {
    await i;
  }
}
