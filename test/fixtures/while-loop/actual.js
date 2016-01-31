var PouchDB = require('pouchdb');

async function test() {
  var db = new PouchDB('test');
  while (i < 10) {
    i++;
    await db.put({_id: i});
  }
  return await db.allDocs();
}
