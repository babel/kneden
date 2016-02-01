function getDoc() {
  var doc;
  return Promise.resolve().then(function () {
    return request('https://example.com/api/get-doc-id');
  }).then(function (_resp) {
    return db.get(_resp);
  }).then(function (_resp) {
    doc = _resp;

    delete doc._rev;
    return doc;
  });
}
