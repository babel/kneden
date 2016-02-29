Kneden
======

[![Build Status](https://travis-ci.org/marten-de-vries/kneden.svg?branch=master)](https://travis-ci.org/marten-de-vries/kneden)
[![Dependency Status](https://david-dm.org/marten-de-vries/kneden.svg)](https://david-dm.org/marten-de-vries/kneden)
[![devDependency Status](https://david-dm.org/marten-de-vries/kneden/dev-status.svg)](https://david-dm.org/marten-de-vries/kneden#info=devDependencies)

> Transpile ES7 async/await to vanilla ES6 Promise chains

**WARNING: Kneden
[is usable](https://github.com/pouchdb/pouchdb-plugin-helper/pull/9), but it's
also [not complete yet](https://github.com/marten-de-vries/kneden/issues/13).**

Do you want an ES7 async/await transpiling [Babel](https://babeljs.io/) plugin,
that:

- produces readable code - even when generator functions are not available?
- doesn't come with a runtime your users have to download?

Then look no further! **Kneden** can help you.

## Example

**In**

```js
async function test() {
  await db.destroy();
}
```

**Out**

```js
function test() {
  return Promise.resolve().then(function () {
    return db.destroy();
  }).then(function () {});
}
```

(The last .then() might seem superfluous at first, but the first function
doesn't actually resolve to anything so it's necessary to make a valid
translation.)

**Kneden** tries to translate ES7 async/await to promises in a manner similar to
how a human would do so. Loops are converted to recursive functions, and your
code is modified in such a way that a return won't just drop you in the next
part of the promise chain, but actually does what you expect it to do.

For more examples, see the
[test/fixtures directory](https://github.com/marten-de-vries/kneden/tree/master/test/fixtures)
for both the input and output **Kneden** takes/produces.

## Installation

```sh
$ npm install kneden
```

## Usage

Note: Kneden only supports transpiling ES5 with the addition of async/await. If
you're using other ES6 features (like arrow functions, let/const, classes,
etc.), make sure you transpile them down to valid ES5 code first using the
[babel es2015 preset](https://www.npmjs.com/package/babel-preset-es2015). See
[#19](https://github.com/marten-de-vries/kneden/issues/19) for more information.

### Via `.babelrc` (Recommended)

**.babelrc**

```json
{
  "plugins": ["kneden"]
}
```

### Via CLI

```sh
$ babel --plugins kneden script.js
```

### Via Node API

```javascript
require("babel-core").transform("code", {
  plugins: ["kneden"]
});
```

You can also use the plug-in in [Browserify](http://browserify.org/) using
[babelify](https://github.com/babel/babelify), in [Rollup](http://rollupjs.org/)
by using it in conjunction with
[rollup-plugin-babel](https://github.com/rollup/rollup-plugin-babel), and in
[Webpack](https://webpack.github.io/) using
[babel-loader](https://github.com/babel/babel-loader).

Unsupported
-----------

- Return statements aren't properly supported in switch and try/catch/finally
  statements yet ([#13](https://github.com/marten-de-vries/kneden/issues/13))
- No ``eval()``; but that's true for other Babel plugins/presets as well.

Contributing
------------

- Reporting test results with your code base
- [Support removing items while iterating for ForInStatement - #18](https://github.com/marten-de-vries/kneden/issues/18)

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
