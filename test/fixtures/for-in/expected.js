function test(object) {
  function _recursive() {
    var _test;

    return Promise.resolve().then(function () {
      _test = _keys.length;

      if (_test) {
        key = _keys.pop();
      }

      if (_test && key in _object) {
        return Promise.resolve().then(function () {
          return key;
        }).then(function () {});
      }
    }).then(function () {
      if (_test) {
        return _recursive();
      }
    });
  }

  var key, _keys, _object;

  return Promise.resolve().then(function () {
    _object = object;
    _keys = [];

    for (var _key in _object) {
      _keys.push(_key);
    }

    _keys.reverse();

    return _recursive();
  }).then(function () {});
}
