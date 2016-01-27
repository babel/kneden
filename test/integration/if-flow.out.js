function test() {
  var pCond1, pCond2;
  return Promise.resolve().then(function () {
    pCond1 = a();
    if (pCond1 && b()) {
      c();
    } else {
      return Promise.resolve().then(function () {
        return pCond1 && Promise.resolve().then(function () {
          return d();
        });
      }).then(function (pResp) {
        pCond2 = pResp;
        if (pCond2) {
          return Promise.resolve().then(function () {
            return e();
          });
        }
      }).then(function () {
        if (pCond2 && f()) {
          return Promise.resolve().then(function () {
            return g();
          });
        } else {
          return Promise.resolve().then(function () {
            if (pCond2) {
              return h();
            } else {
              return Promise.resolve().then(function () {
                if (pCond1) {
                  return i();
                } else {
                  return Promise.resolve().then(function () {
                    return j();
                  });
                }
              });
            }
          });
        }
      });
    }
  }).then(function () {
  });
}
