function test() {
  var _test;

  return Promise.resolve().then(function () {
    _test = a();

    if (_test && b()) {
      return c();
    } else {
      return d();
    }
  });
}
