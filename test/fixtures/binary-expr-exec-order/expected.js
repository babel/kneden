function test() {
  var _temp;

  return Promise.resolve().then(function () {
    return Promise.resolve().then(function () {
      _temp = a();
      return b();
    }).then(function (_resp) {
      return _temp + _resp;
    });
  });
}
