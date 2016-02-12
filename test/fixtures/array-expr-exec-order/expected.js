function test() {
  return Promise.resolve().then(function () {
    return Promise.all([a(), b(), c(), Promise.resolve().then(function () {
      return d();
    }).then(function (_resp) {
      return _resp.ok;
    })]);
  });
}
