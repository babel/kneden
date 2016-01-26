function test() {
  return Promise.resolve().then(function () {
    return a || function () {
      return Promise.resolve().then(function () {
        return b;
      });
    }();
  }).then(function (pResp) {
    return pResp.ok;
  });
}
