async function test() {
  var test = a() ? await b() : c();
  return d() ? e() : await f();
}
