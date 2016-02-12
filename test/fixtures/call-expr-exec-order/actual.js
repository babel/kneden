async function test() {
  return test2(a(), await b(), c(), (await d()).ok);
}
