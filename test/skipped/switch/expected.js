function test() {
  return Promise.resolve().then(function () {
    return function () {
      var pIdx;
      return Promise.resolve().then(function () {
        pIdx = [
          2,
          3,
          4,
          5
        ].indexOf(a());
        if (pIdx !== -1 && pIdx <= 0) {
          return Promise.resolve().then(function () {
            return b();
          });
        } else {
          return Promise.resolve().then(function () {
            if (pIdx !== -1 && pIdx <= 2) {
              console.log(4);
            } else {
              return Promise.resolve().then(function () {
                if (pIdx <= 2) {
                  console.log('default');
                }
                if (pIdx !== -1 && pIdx <= 3) {
                  return Promise.resolve().then(function () {
                    return d();
                  });
                }
              });
            }
          });
        }
      });
    }();
  }).then(function () {
    console.log('done!');
  });
}
