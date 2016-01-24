async function test() {
  var a = await db.post({});
  if (a) {
    await db.destroy();
  }
  var b = 1 + 1;
}
