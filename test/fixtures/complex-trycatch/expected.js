function test() {
  var a, b, c, d, e;
  return Promise.resolve().then(function () {
    return a();
  }).then(function (_resp3) {
    a = _resp3;
    return Promise.resolve().then(function () {
      b = new PouchDB('test2');
      return db.destroy();
    }).then(function (_resp) {
      c = _resp;
    }).catch(function (err) {
      return Promise.resolve().then(function () {
        return new PouchDB('test').destroy();
      }).then(function (_resp2) {
        d = _resp2;
      });
    });
  }).then(function () {
    return b();
  }).then(function (_resp4) {
    e = _resp4;

    return a + b + c + d + e + 2;
  });
}
