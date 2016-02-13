function a() {
  console.log('test');
}

async function test() {
  var i, j;
  i = 0;
  j = 0;

  outer:
  while (i < 10) {
    i++;
    inner:
    while (j < 10) {
      await a();
      console.log(i, j);
      j++;
      if (i === 8) {
        break outer;
      }
      if (i === 1) {
        continue outer;
      }
      if (i === j) {
        break inner;
      }
    }
  }
}

test();
