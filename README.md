Kneden
======

[![Build Status](https://travis-ci.org/marten-de-vries/kneden.svg?branch=master)](https://travis-ci.org/marten-de-vries/kneden)
[![Dependency Status](https://david-dm.org/marten-de-vries/kneden.svg)](https://david-dm.org/marten-de-vries/kneden)
[![devDependency Status](https://david-dm.org/marten-de-vries/kneden/dev-status.svg)](https://david-dm.org/marten-de-vries/kneden#info=devDependencies)

> Transpile ES7 async/await to vanilla ES6 Promise chains

**WARNING: Kneden is alpha quality software.**

Do you want an ES7 async/await transpiler that:

- produces readable code - even when generator functions are not available?
- doesn't come with a runtime your users have to download?

Then look no further! **Kneden** can help you.

Example
-------

input:
```js
async function test() {
  await db.destroy();
}
```

output:
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

**Kneden** tries to translate ES6 async/await to promises in a manner similar to
how a human would do so. Loops are converted to recursive functions, and your
code is modified in such a way that a return won't just drop you in the next
part of the promise chain, but actually does what you expect it to do.

For more examples, see the test/integration directory for both the input and
output **Kneden** gives.

CLI
---

```bash
marten@procyon:~$ echo "async function test() {}" | ./bin/kneden
function test() {
  return Promise.resolve();
}
marten@procyon:~$
```

API
---

```js
var compile = require('kneden');
var resp = compile('async function test() {}');
console.log(resp); // function test() {return Promise.resolve(); }
```

Unsupported/TODO/Contributing
-----------------------------

- not written with ``eval()`` in mind. It's fine in synchronous code though, and
  depending on how you use it might be fine otherwise too. The same is true for
  the ``with`` statement.
- no labeled statements within ``async`` functions. To support this, I'd need an
  algorithm to refactor them into loops, if statements, recursive functions,
  etc. Preferably something that makes the output somewhat comprehendable.
- testing and bug fixing
- integration with tools as [Browserify](http://browserify.org/),
  [webpack](https://webpack.github.io/), [Babel](https://babeljs.io/),
  [rollup.js](http://rollupjs.org/), etc.
- whitespace and quite a few comments are lost during conversion. Maybe
  migrating to something like [recast](https://github.com/benjamn/recast) would
  help.

Contributions welcome! Just open an issue or PR.

What's up with the name?
------------------------

It's Dutch for 'to knead'/'to mold' - the program molds ES7 async/await
constructs into promises. It seemed applicable. [Pronounciation](https://upload.wikimedia.org/wikipedia/commons/0/0e/Nl-kneden.ogg).

License
-------

ISC

---

**Kneden** is a project by [Marten de Vries](https://ma.rtendevri.es/).
