function test() {
  var a, b, c, d, e;
  return Promise.resolve().then(function () {
    return a();
  }).then(function (pResp) {
    a = pResp;
    return Promise.resolve().then(function () {
      b = new PouchDB('test2');
      return db.destroy();
    }).then(function (pResp) {
      c = pResp;
    }).catch(function (err) {
      return Promise.resolve().then(function () {
        return new PouchDB('test').destroy();
      }).then(function (pResp) {
        d = pResp;
      });
    });
  }).then(function () {
    return b();
  }).then(function (pResp) {
    e = pResp;
    return a + b + c + d + e + 2;
  });
}
