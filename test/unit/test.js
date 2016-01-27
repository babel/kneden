var astutils = require('../../lib/astutils');
var astrefactor = require('../../lib/astrefactor');

require('chai').should();

describe('flattening returning ifs', () => {
  function cmp(a, b) {
    var ast = astutils.parse(a).body[0].body;
    var result = astrefactor.flattenReturningIfs(ast);
    astutils.generate(result).should.equal(b.trim() + '\n');
  }
  it('should flatten relevant ifs', () => {
    cmp(`
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
    `, `
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
    `)
  });
  it('more returns', () => {
    cmp(`
      function x() {
        if (i === 2) {
          if (j === 3) {
            return a;
          } else {
            return b;
          }
          return c;
        }
        return d;
      }
    `, `
{
  var pCond1 = i === 2;
  if (pCond1 && j === 3) {
    return a;
  } else if (pCond1) {
    return b;
  }
  if (pCond1) {
    return c;
  }
  return d;
}
    `);
  });
  it('complicated flow', () => {
    cmp(`
      async function test() {
        if (a()) {
          if (b()) {
            c();
            return;
          }
          if (await d()) {
            await e();
            if (f()) {
              return await g();
            } else {
              return h();
            }
          }
          return i();
        }
        return await j();
      }
    `, `
{
  var pCond1 = a();
  if (pCond1 && b()) {
    c();
    return;
  }
  var pCond2 = pCond1 && (await d());
  if (pCond2) {
    await e();
  }
  if (pCond2 && f()) {
    return await g();
  } else {
    if (pCond2) {
      return h();
    }
  }
  if (pCond1) {
    return i();
  }
  return await j();
}
    `);
  })
});

describe('directly exitable when in promise chain', () => {
  function cmp(a, b) {
    var ast = astrefactor.directlyExitable(astutils.parse(a).body[0].body);
    astutils.generate(ast).should.equal(b.trim() + '\n');
  }
  it('should ignore a function with a single point of exit', () => {
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

  it('return in else too', () => {
    cmp(`
      function x() {
        if (i === 2) {
          if (j === 3) {
            return;
          } else {
            return;
          }
          console.log(2);
        }
      }
    `, `
{
  var pCond1 = i === 2;
  if (!(pCond1 && j === 3)) {
    if (!pCond1) {
      if (pCond1) {
        console.log(2);
      }
    }
  }
}
    `);
  });

  it('should support return values', () => {
    cmp(`
      function x() {
        if (i === 2) {
          if (j === 3) {
            return a;
          } else {
            return b;
          }
          return c;
        }
        return d;
      }
    `, `
{
  var pCond1 = i === 2;
  if (pCond1 && j === 3) {
    return a;
  } else {
    if (pCond1) {
      return b;
    } else {
      if (pCond1) {
        return c;
      } else {
        return d;
      }
    }
  }
}
    `);
  });
});
