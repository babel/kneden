function test() {
  return Promise.resolve().then(function () {
    return function () {
      return Promise.resolve().then(function () {
        return a();
      }).then(function () {
        return b();
      }).then(function () {
        c();
        d();
        return e();
      }).then(function (pResp) {
        return pResp;
      });
    }();
  }).then(function () {
  });
}
