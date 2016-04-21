function fn() {
  var o1, o2;
  return Promise.resolve().then(function () {
    o1 = {
      a: function a() {
        console.log('o1.a');
      }
    };
    o2 = {
      a: function a() {
        console.log('o2.a');
      }
    };
  });
}
