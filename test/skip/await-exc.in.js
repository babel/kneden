async function test() {
  try {
    await db.destroy();
  } catch(err) {
    await db.post({});
  }
}
