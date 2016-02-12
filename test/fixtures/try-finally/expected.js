function test() {
  return Promise.resolve().then(function () {
    return Promise.resolve().then(function () {
      return db.info();
    }).then(function (_resp) {
      console.log(_resp);
    }).then(function () {
      return db.destroy();
    }, function (_err) {
      return Promise.resolve().then(function () {
        return db.destroy();
      }).then(function () {
        throw _err;
      });
    });
  }).then(function () {});
}
