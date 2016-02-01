function test() {
  var _discriminant, _match, _brokenOut, _test;

  return Promise.resolve().then(function () {
    _discriminant = a();
    _match = false;
    _brokenOut = false;

    if (!_brokenOut && (_match || _discriminant === 2)) {
      return b();
    } else {
      return Promise.resolve().then(function () {
        if (!_brokenOut && (_match || _discriminant === 3)) {
          _match = true;
        }

        if (!_brokenOut && (_match || _discriminant === 4)) {
          console.log(4);
          _brokenOut = true;
          _match = true;
        }

        if (!_brokenOut && (_match || _discriminant === 5)) {
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
  }).then(function () {});
}
