function test(a) {
  var b;
  return Promise.resolve().then(function () {
    if (a) {
      b = 3;
    } else {
      b = 4;
    }
    return b;
  });
}
