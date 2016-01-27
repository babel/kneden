function test(a) {
  var i, pItems, pItem;
  return Promise.resolve().then(function () {
    pItems = [];
    for (pItem in a) {
      pItems.push(pItem);
    }
    pItems.reverse();
    return function pRecursive() {
      return Promise.resolve().then(function () {
        if (pItems.length) {
          return Promise.resolve().then(function () {
            i = pItems.pop();
            return i;
          }).then(function () {
            return pRecursive();
          });
        }
      });
    }();
  }).then(function () {
  });
}
