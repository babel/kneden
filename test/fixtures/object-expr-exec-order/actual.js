async function test() {
  return {
    a: a(),
    b: await b(),
    c: c(),
    d: (await d()).ok
  };
}
