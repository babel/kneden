function test() {
  var pThis = this;
  var pArguments = arguments;
  return Promise.resolve().then(function () {
    console.log(pThis);
    console.log(pArguments);
  });
}
