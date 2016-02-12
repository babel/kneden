function test() {
  var i;
  return Promise.resolve().then(function () {
    i = 0;
    return function _recursive() {
      return Promise.resolve().then(function () {
        return db.post({});
      }).then(function () {
        i++;

        if (i < 11) {
          return _recursive();
        }
      });
    }();
  }).then(function () {});
}
