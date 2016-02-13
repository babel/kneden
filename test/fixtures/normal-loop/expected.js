function test() {
  var i;
  return Promise.resolve().then(function () {
    i = 0;

    test: while (i < 10) {
      i++;
      continue test;
    }
  });
}
