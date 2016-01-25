var request = require('request-promise');
function test() {
  var pages, i;
  return Promise.resolve().then(function () {
    pages = [];
    i = 0;
    return function pRecursive() {
      return Promise.resolve().then(function () {
        if (i < 10) {
          return Promise.resolve().then(function () {
            return request('https://example.com/page' + i);
          }).then(function (pResp) {
            pages.push(pResp);
            i++;
            return pRecursive();
          });
        }
      });
    }();
  }).then(function () {
  });
}
