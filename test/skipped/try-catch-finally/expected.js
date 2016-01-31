function test() {
  return Promise.resolve().then(function () {
    return Promise.resolve().then(function () {
      return db.destroy();
    }).catch(function (err) {
      return Promise.resolve().then(function () {
        console.log(err);
        return db.post({});
      }).then(function (pResp) {
        console.log(pResp);
      });
    }).then(function () {
      return Promise.resolve().then(function () {
        return db.info();
      });
    }, function (pErr) {
      return Promise.resolve().then(function () {
        return db.info();
      }).then(function () {
        throw pErr;
      });
    });
  }).then(function () {
  });
}
