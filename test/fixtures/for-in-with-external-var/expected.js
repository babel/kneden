function test(a) {
  var i;
  return Promise.resolve().then(function () {
    var _items = [];

    for (var _item in a) {
      _items.push(_item);
    }

    _items.reverse();

    return function _recursive() {
      if (_items.length) {
        return Promise.resolve().then(function () {
          i = _items.pop();
          return i;
        }).then(function () {
          return _recursive();
        });
      }
    }();
  }).then(function () {});
}
