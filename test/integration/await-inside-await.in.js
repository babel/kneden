async function getDoc() {
  var doc = await db.get(await request('https://example.com/api/get-doc-id'));
  delete doc._rev;
  return doc;
}
