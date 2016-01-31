function test() {
  return Promise.resolve().then(function () {
    return Promise.resolve().then(function () {
      return a();
    }).then(function () {
      return b();
    }).then(function () {
      c();
      d();
      return e();
    });
  }).then(function (_resp) {
    test(_resp);
  });
}
