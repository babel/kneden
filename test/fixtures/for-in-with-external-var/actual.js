async function test(object) {
  var key;
  for (key in object) {
    await key;
  }
}
