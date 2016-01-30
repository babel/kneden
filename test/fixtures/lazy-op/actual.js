async function test() {
  return (a() || await b()).ok;
}
