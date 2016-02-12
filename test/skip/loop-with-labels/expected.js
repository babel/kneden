function test() {
  var i, j;
  return Promise.resolve().then(function () {
    i = 0;
    j = 0;

    return function outer() {
      if (i < 10) {
        return Promise.resolve().then(function () {
          i++;
          return function inner() {
            var _test;

            return Promise.resolve().then(function () {
              _test = j < 10;

              if (_test) {
                return Promise.resolve().then(function () {
                  return a();
                }).then(function () {
                  console.log(i, j);
                  j++;
                });
              }
            }).then(function () {
              if (_test && i === 8) {
                return outer;
              } else {
                if (_test && i === 1) {
                  return outer();
                } else {
                  if (_test && i === j) {
                    return inner;
                  } else {
                    if (_test) {
                      return inner();
                    }
                  }
                }
              }
            }).then(function (_resp) {
              if (_resp !== inner) {
                return _resp;
              }
            });
          }();
        }).then(function () {
          return outer();
        });
      }
    }();
  }).then(function () {});
}

test();
