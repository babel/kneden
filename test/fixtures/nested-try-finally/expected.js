function test() {
  return Promise.resolve().then(function () {
    return Promise.resolve().then(function () {
      return Promise.resolve().then(function () {
        return a();
      }).then(function () {
        return b();
      }, function (_err) {
        return Promise.resolve().then(function () {
          return b();
        }).then(function () {
          throw _err;
        });
      });
    }).then(function () {
      return c();
    }, function (_err) {
      return Promise.resolve().then(function () {
        return c();
      }).then(function () {
        throw _err;
      });
    });
  }).then(function () {});
}

function test2() {
  return Promise.resolve().then(function () {
    return Promise.resolve().then(function () {
      return a();
    }).then(function () {
      return Promise.resolve().then(function () {
        return b();
      }).then(function () {
        return c();
      }, function (_err) {
        return Promise.resolve().then(function () {
          return c();
        }).then(function () {
          throw _err;
        });
      });
    }, function (_err) {
      return Promise.resolve().then(function () {
        return Promise.resolve().then(function () {
          return b();
        }).then(function () {
          return c();
        }, function (_err) {
          return Promise.resolve().then(function () {
            return c();
          }).then(function () {
            throw _err;
          });
        });
      }).then(function () {
        throw _err;
      });
    });
  }).then(function () {});
}
