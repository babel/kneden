function test() {
  var _descriminant, _index;
  return Promise.resolve().then(function () {
    _descriminant = a();
    _index = _descriminant === 2 ? 0 : (
      _descriminant === 3 ? 1 : (
        _descriminant === 4 ? 2 : (
          _descriminant === 5 ? 3 : -1
        )
      )
    );
    if (_index !== -1 && _index <= 0) {
      return b();
    } else {
      if (_index !== -1 && _index <= 2) {
        console.log(4);
      } else {
        if (_index <= 2) {
          console.log('default');
        }
        if (_index <= 3) {
          return d();
        }
      }
    }
  }).then(function () {
    console.log('done!');
  });
}
