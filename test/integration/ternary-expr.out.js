function test() {
  var test;
  return Promise.resolve().then(function () {
    return a() ? Promise.resolve().then(function () {
      return b();
    }) : c();
  }).then(function (pResp) {
    test = pResp;
    return d() ? Promise.resolve().then(function () {
      return e();
    }) : Promise.resolve().then(function () {
      return f();
    });
  });
}
