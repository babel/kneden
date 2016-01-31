async function test() {
  var a = await a();
  try {
    var b = new PouchDB('test2');
    var c = await db.destroy();
  } catch (err) {
    var d = await new PouchDB('test').destroy();
  }
  var e = await b();

  return a + b + c + d + e + 2;
}
