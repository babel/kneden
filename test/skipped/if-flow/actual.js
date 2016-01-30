async function test() {
  if (a()) {
    if (b()) {
      c();
      return;
    }
    if (await d()) {
      await e();
      if (f()) {
        return await g();
      } else {
        return h();
      }
    }
    return i();
  }
  return await j();
}
