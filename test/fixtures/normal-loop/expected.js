function test() {
  var i;
  return Promise.resolve().then(function () {
    i = 0;

    while (i < 10) {
      i++;
    }
  });
}
