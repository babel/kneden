async function test() {
  var i = 0;
  while (i < 10) {
    i++;
    if ((await db.put({_id: i})).ok) {
      continue;
    }
    if (i === 2) {
      break;
    }
    var a = await db.destroy();
  }
}

//TODO: break? continue?
/*
async function test() {
  var i = 0;
  return (async function pRecursive {
    var result = undefined;
    if (i < 10) {
      i++;
      if ((await db.put({_id: i})).ok) {
        result = pRecursive();
      } else if (i !== 2) {
        var a = await db.destroy();
        await pRecursive();
      }
    }
    return result;
  })();
}
*/
