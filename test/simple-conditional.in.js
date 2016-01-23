async function test() {
  var a = await db.post({});
  if (a) {
    await db.destroy();
  }
  1 + 1;
}
