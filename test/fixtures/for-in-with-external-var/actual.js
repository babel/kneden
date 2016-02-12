async function test(a) {
  var i;
  for (i in a) {
    await i;
  }
}
