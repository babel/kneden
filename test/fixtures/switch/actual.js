async function test() {
  switch (a()) {
    case 2:
      // FIXME: return b() is probably a wrong translation. Return value should
      // be undefined! Also, shouldn't throw away the result value later on.
      // (although ironically, that evens out the earlier bug in this case?)
      await b();
      return;
    case 3:
    case 4:
      console.log(4);
      break;
    default:
      console.log('default');
      // falls through
    case 5:
      await d();
  }
  console.log('done!');
}
