function test() {
  var i;
  return Promise.resolve().then(function () {
    i = 0;
    return function pRecursive() {
      return Promise.resolve().then(function () {
        return db.post({});
      }).then(function () {
        i++;
        if (i < 11) {
          return Promise.resolve().then(function () {
            return pRecursive();
          });
        }
      });
    }();
  }).then(function () {
  });
}
