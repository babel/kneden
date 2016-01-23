function test() {
  return Promise.resolve().then(function () {
    return Promise.resolve().then(function () {
      return db.destroy();
    }).catch(function (err) {
      return Promise.resolve().then(function () {
        return db.post({});
      });
    });
  }).then(function () {
  });
}
