function test() {
  var i;
  return Promise.resolve().then(function () {
    i = 0;
    return function pRecursive() {
      var a;
      return Promise.resolve().then(function () {
        if (i < 10) {
          return Promise.resolve().then(function () {
            i++;
            return db.put({ _id: i });
          }).then(function (pResp) {
            if (pResp.ok) {
              return pRecursive();
            }
            if (i === 2) {
              return;
            }
            return db.destroy();
          }).then(function (pResp) {
            a = pResp;
            return pRecursive();
          });
        }
      }).then(function () {
      });
    }();
  });
}
