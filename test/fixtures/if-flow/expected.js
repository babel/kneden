function test() {
  var _test, _test2;

  return Promise.resolve().then(function () {
    _test = a();

    if (_test && b()) {
      c();
    } else {
      return Promise.resolve().then(function () {
        return _test && d();
      }).then(function (_resp) {
        _test2 = _resp;

        if (_test2) {
          return e();
        }
      }).then(function () {
        if (_test2 && f()) {
          return g();
        } else {
          if (_test2) {
            return h();
          }

          if (_test) {
            return i();
          }

          return j();
        }
      });
    }
  }).then(function () {});
}
