function test() {
  return Promise.resolve().then(function () {
    return Promise.resolve().then(function () {
      going.to.fail;
    }).catch(function (err) {
      return postErrorMessage('http://my.webservice/error', err);
    });
  }).then(function () {});
}
