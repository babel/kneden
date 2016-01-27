function getDoc() {
  var doc;
  return Promise.resolve().then(function () {
    return request('https://example.com/api/get-doc-id');
  }).then(function (pResp) {
    return db.get(pResp);
  }).then(function (pResp) {
    doc = pResp;
    delete doc._rev;
    return doc;
  });
}
