function test() {
  return Promise.resolve().then(function () {
    return Promise.resolve().then(function () {
      return db.info();
    }).then(function (pResp) {
      console.log(pResp);
    }).then(function () {
      return Promise.resolve().then(function () {
        return db.destroy();
      });
    }, function (pErr) {
      return Promise.resolve().then(function () {
        return db.destroy();
      }).then(function () {
        throw pErr;
      });
    });
  }).then(function () {
  });
}
