function test() {
  var _this = this,
      _arguments = arguments;

  return Promise.resolve().then(function () {
    console.log(_this);
    console.log(_arguments);
  });
}
