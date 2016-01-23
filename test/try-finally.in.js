async function test() {
  try {
    console.log(await db.info());
  } finally {
    await db.destroy();
  }
}
