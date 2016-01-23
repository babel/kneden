kneden
======

> Compile ES7 async/await to vanilla ES6 Promise chains

**WARNING: kneden is a still a WIP and only a very small subset of what it promises (pun intended) is implemented.**

Example
-------

```js
async function test() {
  await db.destroy();
}
```

->

```js
function test() {
  return Promise.resolve().then(function () {
    return db.destroy();
  }).then(function () {
  });
}
```

(The last ``.then()`` might seem superfluous at first, but the first function
doesn't actually resolve to anything so it's necessary to make a valid
translation.)

See for more examples the ``test`` directory.

API
---

```js
var compile = require('kneden');
var resp = compile('async function () {}');
console.log('resp'); // function () {return Promise.resolve(); }
```

What's up with the name?
------------------------

It's Dutch for 'to knead'/'to mold' - the program molds ES7 async/await
constructs into promises. It seemed applicable. [Pronounciation](https://upload.wikimedia.org/wikipedia/commons/0/0e/Nl-kneden.ogg).

License
-------

ISC
