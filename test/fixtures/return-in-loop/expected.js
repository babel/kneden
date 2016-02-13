/* eslint no-constant-condition: 0 */

function test() {
  function _recursive() {
    var _test;

    return Promise.resolve().then(function () {
      _test = true;
      return _test && a();
    }).then(function (_resp) {
      if (_resp) {
        return "now";
      } else {
        if (_test) {
          return _recursive();
        }
      }
    });
  }

  var _temp;

  return Promise.resolve().then(function () {
    return _recursive();
  }).then(function (_resp) {
    _temp = _resp;

    if (_temp !== _recursive) {
      return _temp;
    }
  });
}
