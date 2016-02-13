function a() {
  console.log('test');
}

function test() {
  function outer() {
    function inner() {
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
      });
    }

    var _temp;

    if (i < 10) {
      return Promise.resolve().then(function () {
        i++;
        return inner();
      }).then(function (_resp) {
        _temp = _resp;

        if (_temp !== inner) {
          return _temp;
        } else {
          return outer();
        }
      });
    }
  }

  var i, j;
  return Promise.resolve().then(function () {
    i = 0;
    j = 0;

    return outer();
  }).then(function () {});
}

test();
