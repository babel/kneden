async function test() {
  var test = a() ? await b() : c();
  return d() ? (await e()).ok : await f();
}
