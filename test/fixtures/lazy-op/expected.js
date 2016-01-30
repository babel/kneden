function test() {
  return Promise.resolve().then(function () {
    return a() || b();
  }).then(function (_resp) {
    return _resp.ok;
  });
}
