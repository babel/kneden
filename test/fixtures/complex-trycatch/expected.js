function test() {
  var a, b, c, d, e;
  return Promise.resolve().then(function () {
    return a();
  }).then(function (_resp) {
    a = _resp;
    return Promise.resolve().then(function () {
      b = new PouchDB('test2');
      return db.destroy();
    }).then(function (_resp) {
      c = _resp;
    }).catch(function (err) {
      return Promise.resolve().then(function () {
        return new PouchDB('test').destroy();
      }).then(function (_resp) {
        d = _resp;
      });
    });
  }).then(function () {
    return b();
  }).then(function (_resp) {
    e = _resp;


    return a + b + c + d + e + 2;
  });
}
