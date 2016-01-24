var astutils = require('../../astutils');
var chai = require('chai');

it.skip('should flatten ifs', () => {
  astutils.generate(astutils.flattenIfs(astutils.parse(`
    function(x) {
      console.log(1);
      if (i === 2) {
        console.log(2);
        if (j === 3) {
          console.log(3);
          return;
        }
        console.log(4);
        if (k === 4) {
          console.log(5);
        }
        console.log(6);
      }
      console.log(7);
    }
  `).body[0].body)).should.equal(`
console.log(1);
var pCond1 = i === 2;
if (pCond1) {
  console.log(2);
}
if (pCond1 && j === 3) {
  console.log(3);
  return;
}
if (pCond1) {
  console.log(4);
}
if (pCond1 && k === 4) {
  console.log(5);
}
if (pCond1) {
  console.log(6);
}
console.log(7);
    `.trim() + '\n')
});
