var fs = require('fs');
var path = require('path');
var diff = require('diff');
require('colors');
var compile = require('../index.js');

var items;
var args = process.argv.slice(2);
if (args.length) {
  items = args;
} else {
  items = fs.readdirSync(__dirname).map(function (file) {
    return path.join(__dirname, file);
  });
}

var passes = 0;
var total = 0;
items.forEach(function (inName) {
  var inSplit = inName.split('.');
  var outName = inSplit[0] + '.out.js';
  if (inSplit.slice(1).join('.') === 'in.js' && fs.existsSync(outName)) {
    total++;
    var code = fs.readFileSync(inName, {encoding: 'utf-8'});
    var expected = fs.readFileSync(outName, {encoding: 'utf-8'});
    var result = compile(code);
    if (expected === result) {
      passes++;
    } else {
      diff.diffLines(expected, result).forEach(function (part) {
        var color = part.added ? 'green' : (part.removed ? 'red' : 'white');
        process.stderr.write(part.value[color]);
      });
    }
  }
});
process.stderr.write(passes + ' out of ' + total + ' tests passed\n');
