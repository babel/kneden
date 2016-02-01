function test() {
  return Promise.resolve().then(function () {
    if (a()) {
      return b();
    } else {
      if (c()) {
        return d();
      }
    }
  }).then(function () {
    return function _recursive() {
      if (c()) {
        return Promise.resolve().then(function () {
          return d();
        }).then(function () {
          return _recursive();
        });
      }
    }();
  }).then(function () {});
}
