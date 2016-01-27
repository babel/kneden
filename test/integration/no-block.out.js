function test() {
  return Promise.resolve().then(function () {
    if (a()) {
      return Promise.resolve().then(function () {
        return b();
      });
    } else {
      return Promise.resolve().then(function () {
        if (c()) {
          return Promise.resolve().then(function () {
            return d();
          });
        }
      });
    }
  }).then(function () {
    return function pRecursive() {
      return Promise.resolve().then(function () {
        if (c()) {
          return Promise.resolve().then(function () {
            return d();
          }).then(function () {
            return pRecursive();
          });
        }
      });
    }();
  }).then(function () {
  });
}
