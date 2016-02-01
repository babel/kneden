function test() {
  var _resp;

  return Promise.resolve().then(function () {
    _resp = 2;
    return x();
  }).then(function (_resp2) {
    console.log(_resp2);
    console.log(_resp);
  });
}
