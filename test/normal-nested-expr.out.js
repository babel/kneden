function a() {
  var b;
  return Promise.resolve().then(function () {
    b = function () {
    };
  });
}
