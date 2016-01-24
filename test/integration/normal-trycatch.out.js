(function () {
  return Promise.resolve().then(function () {
    try {
      a.b;
    } catch (err) {
      // reference error
      console.log(err);
    }
  });
});
