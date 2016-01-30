function test() {
  return Promise.resolve().then(function () {
    return db.destroy();
  }).then(function () {});
}
