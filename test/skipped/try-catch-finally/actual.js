async function test() {
  try {
    await db.destroy();
  } catch(err) {
    console.log(err);
    console.log(await db.post({}));
  } finally {
    await db.info();
  }
}
