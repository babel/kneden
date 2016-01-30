function test() {
  var test;
  return Promise.resolve().then(function () {
    return a() ? b() : c();
  }).then(function (_resp) {
    test = _resp;

    return d() ? e() : f();
  });
}
