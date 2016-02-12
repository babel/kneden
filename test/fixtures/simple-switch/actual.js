async function test(n) {
  var a = 0;
  switch(n) {
    case 1:
      a = 2;
      break;
    case await getNum():
      a = 3;
  }
  return a;
}
