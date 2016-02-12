function test() {
  var _discriminant, _match, _brokenOut, _test;

  return Promise.resolve().then(function () {
    _discriminant = a();
    _match = false;
    _brokenOut = false;

    if (!_brokenOut && (_match || 2 === _discriminant)) {
      return Promise.resolve().then(function () {
        return b();
      }).then(function () {
        // FIXME: handle return
        return;
      });
    }
  }).then(function () {
    if (!_brokenOut && (_match || 3 === _discriminant)) {
      _match = true;
    }

    if (!_brokenOut && (_match || 4 === _discriminant)) {
      console.log(4);
      _brokenOut = true;
      _match = true;
    }

    if (!_brokenOut && (_match || 5 === _discriminant)) {
      return Promise.resolve().then(function () {
        return d();
      }).then(function () {
        _match = true;
      });
    }
  }).then(function () {
    _test = !_brokenOut && !_match;

    if (_test) {
      console.log('default');
    }

    if (_test && !_brokenOut) {
      return d();
    }
  }).then(function () {
    console.log('done!');
  });
}
