function test() {
  var a, b;
  return Promise.resolve().then(function () {
    return db.post({});
  }).then(function (pResp) {
    a = pResp;
    if (a) {
      return Promise.resolve().then(function () {
        return db.destroy();
      });
    }
  }).then(function () {
    b = 1 + 1;
  });
}
