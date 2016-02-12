function test(n) {
  var a, _discriminant, _match, _brokenOut;

  return Promise.resolve().then(function () {
    a = 0;
    _discriminant = n;
    _match = false;
    _brokenOut = false;

    if (!_brokenOut && (_match || 1 === _discriminant)) {
      a = 2;
      _brokenOut = true;
      _match = true;
    }

    return !_brokenOut && (_match || Promise.resolve().then(function () {
      return getNum();
    }).then(function (_resp) {
      return _resp === _discriminant;
    }));
  }).then(function (_resp) {
    if (_resp) {
      a = 3;
      _match = true;
    }

    return a;
  });
}
