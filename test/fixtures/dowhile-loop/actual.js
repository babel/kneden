async function test() {
  var i = 0;
  do {
    await db.post({});
    i++
  } while (i < 11);
}
