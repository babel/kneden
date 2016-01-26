function test() {
  return Promise.resolve().then(function () {
    return a || Promise.resolve().then(function () {
      return b;
    });
  }).then(function (pResp) {
    return pResp.ok;
  });
}
