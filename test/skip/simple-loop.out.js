/* converted into?
async function test() {
  var i = 0;
  await (async function recursive() {
    if (i < 10) {
      i++;
      if ((await db.post({_id: i})).ok) {
        return await recursive();
      }
      if (i === 2) {
        return;
      }
      await recursive();
    }
  }());
}
*/
