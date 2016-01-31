async function test() {
  var i = 0;
  while (i < 10) {
    i++;
    if ((await db.put({_id: i})).ok) {
      continue;
    }
    if (i === 2) {
      break;
    }
    var a = await db.destroy();
  }
}
