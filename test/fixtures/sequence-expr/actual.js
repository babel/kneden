async function test() {
  test((await a(), await b(), c(), d(), await e()));
}
