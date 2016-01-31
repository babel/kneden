var request = require('request-promise');
async function test() {
  var pages = [];
  for (var i = 0; i < 10; i++) {
    pages.push(await request('https://example.com/page' + i));
  }
}
