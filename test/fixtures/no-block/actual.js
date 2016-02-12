async function test() {
  if (a()) (await b()); else if (c()) (await d());

  while (c()) await d();
}
