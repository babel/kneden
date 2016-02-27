async function test(object) {
  for (var key in object) {
    await key;
  }
}
