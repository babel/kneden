function test(a, b) {
  return Promise.resolve().then(function () {
    if (!(a === b)) {
      return Promise.resolve().then(function () {
        return someOp((a + b) / 2);
      }).then(function () {});
    }
  });
}
