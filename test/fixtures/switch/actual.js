async function test() {
  switch (a()) {
    case 2:
      await b();
      // FIXME: handle return
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
