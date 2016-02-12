async function test() {
  return [a(), await b(), c(), (await d()).ok];
}
