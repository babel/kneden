var request = require('request-promise');
function test() {
  var pages, i;
  return Promise.resolve().then(function () {
    pages = [];
    i = 0;
    return function _recursive() {
      if (i < 10) {
        return Promise.resolve().then(function () {
          return request('https://example.com/page' + i);
        }).then(function (_resp) {
          pages.push(_resp);
          i++;
          return _recursive();
        });
      }
    }();
  }).then(function () {});
}
