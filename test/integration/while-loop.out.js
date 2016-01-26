var PouchDB = require('pouchdb');
function test() {
  var db;
  return Promise.resolve().then(function () {
    db = new PouchDB('test');
    return function pRecursive() {
      return Promise.resolve().then(function () {
        if (i < 10) {
          return Promise.resolve().then(function () {
            i++;
            return db.put({ _id: i });
          }).then(function () {
            return pRecursive();
          });
        }
      });
    }();
  }).then(function () {
    return db.allDocs();
  });
}
