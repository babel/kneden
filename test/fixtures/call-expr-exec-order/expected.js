function test() {
  var _temp;

  return Promise.resolve().then(function () {
    return Promise.all([a(), b(), c(), Promise.resolve().then(function () {
      return d();
    }).then(function (_resp) {
      return _resp.ok;
    })]);
  }).then(function (_resp) {
    _temp = _resp;

    return test2(_temp[0], _temp[1], _temp[2], _temp[3]);
  });
}
