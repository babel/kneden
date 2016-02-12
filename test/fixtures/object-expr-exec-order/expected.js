function test() {
  var _temp;

  return Promise.resolve().then(function () {
    _temp = {};
    _temp.a = a();
    return b();
  }).then(function (_resp) {
    _temp.b = _resp;
    _temp.c = c();
    return d();
  }).then(function (_resp) {
    _temp.d = _resp.ok;

    return _temp;
  });
}
