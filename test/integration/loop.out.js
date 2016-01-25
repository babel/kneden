function test() {
  var i;
  return Promise.resolve().then(function () {
    i = 0;
    return function pRecursive() {
      var pCond1, a;
      return Promise.resolve().then(function () {
        pCond1 = i < 10;
        if (pCond1) {
          i++;
        }
        return pCond1 && function () {
          return db.put({ _id: i }).ok;
        }();
      }).then(function (pResp) {
        if (pResp) {
          return Promise.resolve().then(function () {
            return pRecursive();
          });
        } else {
          return Promise.resolve().then(function () {
            if (!(pCond1 && i === 2)) {
              return Promise.resolve().then(function () {
                if (pCond1) {
                  return Promise.resolve().then(function () {
                    return db.destroy();
                  }).then(function (pResp) {
                    a = pResp;
                    return pRecursive();
                  });
                }
              });
            }
          });
        }
      });
    }();
  }).then(function () {
  });
}
