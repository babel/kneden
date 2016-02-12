/* eslint no-empty: 0 */

function test() {
  var _temp, _temp2;

  return Promise.resolve().then(function () {
    return Promise.resolve().then(function () {
      _temp = c();
      return d();
    }).then(function (_resp) {
      return _temp === _resp;
    });
  }).then(function (_resp) {
    if (_resp) {}

    _temp2 = a();
    return b();
  }).then(function (_resp) {
    return _temp2 + _resp;
  });
}
