function test() {
  var a, b;
  return Promise.resolve().then(function () {
    return db.post({});
  }).then(function (_resp) {
    a = _resp;

    if (a) {
      return db.destroy();
    }
  }).then(function () {
    b = 1 + 1;
  });
}
