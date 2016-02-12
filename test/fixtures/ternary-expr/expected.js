function test() {
  var test;
  return Promise.resolve().then(function () {
    return a() ? b() : c();
  }).then(function (_resp) {
    test = _resp;

    return d() ? Promise.resolve().then(function () {
      return e();
    }).then(function (_resp) {
      return _resp.ok;
    }) : f();
  });
}
