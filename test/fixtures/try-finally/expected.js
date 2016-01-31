function test() {
  return Promise.resolve().then(function () {
    return Promise.resolve().then(function () {
      return db.info();
    }).then(function (_resp) {
      console.log(_resp);
    }).catch(function () {}).then(function () {
      return db.destroy();
    });
  }).then(function () {});
}
