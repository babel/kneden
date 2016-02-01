/* eslint-env node, mocha */

import path from 'path';
import fs from 'fs';
import assert from 'assert';
import {transformFileSync} from 'babel-core';

function trim(str) {
  return str.replace(/^\s+|\s+$/, '');
}

describe('Transpile ES7 async/await to vanilla ES6 Promise chains', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  fs.readdirSync(fixturesDir).forEach(caseName => {
    const fixtureDir = path.join(fixturesDir, caseName);
    const actualPath = path.join(fixtureDir, 'actual.js');
    if (!fs.statSync(fixtureDir).isDirectory()) {
      return;
    }
    it(caseName.split('-').join(' '), () => {
      const actual = transformFileSync(actualPath).code;

      const expected = fs.readFileSync(
          path.join(fixtureDir, 'expected.js')
      ).toString();

      assert.equal(trim(actual), trim(expected));
    });
  });
});
