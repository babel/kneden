function getDoc() {
  var doc;
  return Promise.resolve().then(function () {
    return request('https://example.com/api/get-doc-id');
  }).then(function (_resp) {
    return db.get(_resp);
  }).then(function (_resp2) {
    doc = _resp2;

    delete doc._rev;
    return doc;
  });
}
