var astutils = require('../../astutils');
var astrefactor = require('../../astrefactor');

require('chai').should();

describe('flattening returning ifs', () => {
  it('should flatten relevant ifs', () => {
    astutils.generate(astrefactor.flattenReturningIfs(astutils.parse(`
      function x() {
        console.log(1);
        if (i === 2) {
          console.log(2);
          if (j === 3) {
            console.log(3);
            return;
          } else {
            console.log(4);
          }
          console.log(5);
          if (k === 4) {
            console.log(6);
          }
          console.log(7);
        }
        console.log(8);
      }
    `).body[0].body)).should.equal(`
{
  console.log(1);
  var pCond1 = i === 2;
  if (pCond1) {
    console.log(2);
  }
  if (pCond1 && j === 3) {
    console.log(3);
    return;
  } else if (pCond1) {
    console.log(4);
  }
  if (pCond1) {
    console.log(5);
    if (k === 4) {
      console.log(6);
    }
    console.log(7);
  }
  console.log(8);
}
      `.trim() + '\n')
  });
});

describe('single point of exit', () => {
  function cmp(a, b) {
    var ast = astrefactor.singleExitPoint(astutils.parse(a).body[0].body);
    astutils.generate(ast).should.equal(b.trim() + '\n');
  }
  it('should ignore a function with a SPOE', () => {
    cmp(`
      function x() {
        if (i === 2) {
          if (j === 3) {
            console.log(1);
          } else {
            console.log(2);
          }
        } else {
          console.log(3);
        }
      }
    `, `
{
  if (i === 2) {
    if (j === 3) {
      console.log(1);
    } else {
      console.log(2);
    }
  } else {
    console.log(3);
  }
}
    `);
  });

  it('top level return', () => {
    cmp(
      `function x() {return 1; var x = 2 + 2; }`,
      `
{
  return 1;
}     `
    )
  });

  it('simple example', () => {
    cmp(`
      function x() {
        if (i === 2) {
          return;
        }
        console.log(1);
      }
    `, `
{
  if (!(i === 2)) {
    console.log(1);
  }
}
    `)
  });
});
