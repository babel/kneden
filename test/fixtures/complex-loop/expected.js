function test() {
  function _recursive() {
    var _test;

    _test = i < 10;

    if (_test) {
      i++;
    }

    return Promise.resolve().then(function () {
      return _test && Promise.resolve().then(function () {
        return db.put({ _id: i });
      }).then(function (_resp) {
        return _resp.ok;
      });
    }).then(function (_resp) {
      if (_resp) {
        return _recursive();
      } else {
        if (_test && i === 2) {
          return _recursive;
        } else {
          if (_test) {
            return Promise.resolve().then(function () {
              return db.destroy();
            }).then(function (_resp) {
              a = _resp;
              return _recursive();
            });
          }
        }
      }
    });
  }

  var i, a;
  return Promise.resolve().then(function () {
    i = 0;
    return _recursive();
  }).then(function () {});
}
