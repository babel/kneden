async function test() {
  if (a()) {
    if (b()) {
      return c();
    }
  }
  return d();
}
