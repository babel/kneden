function test() {
  var _test;

  return Promise.resolve().then(function () {
    _test = a;

    if (_test && b) {
      return c;
    } else {
      if (_test) {
        return d;
      } else {
        return e;
      }
    }
  });
}
