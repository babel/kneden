function test() {
  return Promise.resolve().then(function () {
    return a && function () {
      return b;
    }();
  }).then(function (pResp) {
    return pResp;
  });
}
