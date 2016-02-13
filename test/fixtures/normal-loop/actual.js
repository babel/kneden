async function test() {
  var i = 0;
  test: while (i < 10) {
    i++;
    continue test;
  }
}
