# babel-plugin-kneden

 Transpile ES7 async/await to vanilla ES6 Promise chains

## Example

**In**

```js
// input code
```

**Out**

```js
"use strict";

// output code
```

## Installation

```sh
$ npm install babel-plugin-kneden
```

## Usage

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
