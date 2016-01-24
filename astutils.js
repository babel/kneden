// TODO: migrate to https://github.com/benjamn/recast ? Better preservation of
// whitespace etc. would be nice to have. Last try didn't work out though
// (async/await trouble).

// TODO: refactor annihilateReturns(), flattenReturningIfs() &
// recursifyAwaitingLoops

var acorn = require('acorn');
require('acorn-es7-plugin')(acorn);

var estraverse = require('estraverse');
var escodegen = require('escodegen');

exports.parse = function (code) {
  var comments = [];
  var tokens = [];
  var ast = acorn.parse(code, {
    plugins: {asyncawait: true},
    ecmaVersion: 7,
    ranges: true,
    onComment: comments,
    onToken: tokens,
    sourceType: 'module'
  });
  escodegen.attachComments(ast, comments, tokens);

  return ast;
};

exports.isFunc = function (node) {
  return [
    'FunctionDeclaration',
    'FunctionExpression',
    'ArrowFunctionExpression'
  ].indexOf(node.type) !== -1;
};

exports.resolveBase = function () {
  // AST-ish for ``Promise.resolve()``
  return {
    type: 'CallExpression',
    callee: {
      type: 'MemberExpression',
      object: exports.identifier('Promise'),
      property: exports.identifier('resolve')
    },
    arguments: []
  };
};

exports.identifier = function (name) {
  return {
    type: 'Identifier',
    name: name
  };
};

exports.chainCall = function (base, name, args) {
  // AST-ish for (base.then(function (argName) {argBody})) where:
  // - base is 'base'
  // - 'then' or 'catch' is specified by 'name'
  // - args is an array of [argName, argBody] arrays. It's an array so it can be
  //   used for the (...).then(function (resp) {}, function (err) {}) form.
  var argsAst = args.map(function (arg) {
    return functionExpression(arg[0] ? [exports.identifier(arg[0])] : [], arg[1]);
  });
  return {
    type: 'CallExpression',
    callee: {
      type: 'MemberExpression',
      object: base,
      property: exports.identifier(name)
    },
    arguments: argsAst
  };
};

function functionExpression(params, body) {
  return {
    type: 'FunctionExpression',
    params: params,
    body: exports.blockStatement(body)
  };
}

exports.blockStatement = function (body) {
  return {
    type: 'BlockStatement',
    body: body
  };
};

exports.returnStatement = function (argument) {
  return {
    type: 'ReturnStatement',
    argument: argument || null
  };
};

exports.containsAwait = function (node) {
  // does node have a descendant that's an AwaitExpression?
  return matches(node, function (subNode) {
    return subNode.type === 'AwaitExpression';
  });
};

function matches(node, check) {
  var found = false;
  estraverse.traverse(node, {
    enter: function (subNode) {
      if (check(subNode)) {
        found = true;
        this.break();
      }
      if (exports.isFunc(subNode)) {
        this.skip();
      }
    }
  });
  return found;
}

exports.throwStatement = function (argument) {
  return {
    type: 'ThrowStatement',
    argument: argument
  };
};

exports.blockify = function (node) {
  if (node.type === 'ArrowFunctionExpression' && node.expression) {
    // make it a non-expression arrow function for later processing
    node.body = exports.blockStatement([exports.returnStatement(node.body)]);
    node.expression = false;
  }
  return node;
  // TODO: same for if & loops if necessary - TEST!
}

function isLoop(node) {
  return [
    'WhileStatement',
    'DoWhileStatement',
    'ForStatement',
    'ForInStatement'
  ].indexOf(node.type) !== -1;
}

exports.recursifyAwaitingLoops = function (body) {
  // for every loop that contains await: convert from iterative statement to a
  // recursive (async) function.
  return estraverse.replace(body, {
    enter: function (node) {
      if (isLoop(node) && exports.containsAwait(node)) {
        node.body.body.push({type: 'ContinueStatement'});
        var newBody = estraverse.replace(node.body, {
          enter: function (subNode) {
            if (subNode.type === 'BreakStatement') {
              return exports.returnStatement();
            }
            if (subNode.type === 'ContinueStatement') {
              return exports.blockStatement([
                {
                  type: 'ExpressionStatement',
                  expression: {
                    type: 'AwaitExpression',
                    argument: {
                      type: 'CallExpression',
                      callee: exports.identifier('pRecursive'),
                      arguments: []
                    }
                  }
                },
                exports.returnStatement()
              ]);
            }
            if (exports.isFunc(node)) {
              this.skip();
            }
          }
        });
        if (node.type === 'WhileStatement') {
          return exports.returnStatement({
            type: 'CallExpression',
            callee: {
              type: 'FunctionExpression',
              id: exports.identifier('pRecursive'),
              params: [],
              body: exports.blockStatement([
                {
                  type: 'IfStatement',
                  test: node.test,
                  consequent: newBody
                }
              ]),
              async: true
            },
            arguments: []
          });
        }
      }
      if (exports.isFunc(node)) {
        this.skip();
      }
    },
    leave: squashBlockStatements
  });
}

function squashBlockStatements(node) {
  // flatten block statements
  if (node.type === 'BlockStatement') {
    for (var i = 0; i < node.body.length; i++) {
      var subNode = node.body[i];
      if (subNode.type === 'BlockStatement') {
        node.body.splice.apply(node.body, [i, 1].concat(subNode.body))
        // -2: one for the next iteration, one for the removed block
        // statement
        i += subNode.body.length - 2;
      }
    }
  }
}

exports.singleExitPoint = function (block) {
  // guarantee that if there is a return, it's directly in the body *or* in a
  // single-layer if statement.
  block = exports.flattenReturningIfs(block);

  stripAfterReturn(block.body);
  annihilateReturns(block.body);

  return block;
}

function stripAfterReturn(body) {
  // returns the 'return' AST node (if one)
  for (var i = 0; i < body.length; i++) {
    var node = body[i];
    if (node.type === 'ReturnStatement') {
      body.splice(i + 1);
      return node;
    }
  }
}

function annihilateReturns(body) {
  for (var i = 0; i < body.length; i++) {
    var node = body[i];
    if (node.type === 'IfStatement') {
      var retNode = stripAfterReturn(node.consequent.body);
      if (retNode) {
        if (retNode.argument) {
          // TODO
        } else {
          // remove return statement
          node.consequent.body.splice(-1);
        }
        var existingElseBody = (node.alternate || {}).body || [];
        var elseBody = existingElseBody.concat(body.splice(i + 1));
        if (elseBody.length) {
          node.alternate = exports.blockStatement(elseBody);
          annihilateReturns(node.alternate.body);
        }

        if (!node.consequent.body.length) {
          node.consequent = node.alternate;
          node.alternate = null;
          node.test = {
            type: 'UnaryExpression',
            operator: '!',
            argument: node.test
          }
        }
      }
    }
  }
}

function containsReturn(node) {
  // does node have a descendant that's a ReturnStatement?
  return matches(node, function (subNode) {
    return subNode.type === 'ReturnStatement';
  });
}

function shouldBeFlattened(node) {
  // Does ``node`` (IfStatement) have a descendant (IfStatement) that contains
  // a return?
  return matches(node, function (subNode) {
    return node !== subNode && node.type === 'IfStatement' && subNode.type === 'IfStatement' && containsReturn(subNode);
  });
}

exports.flattenReturningIfs = function (block) {
  var flattenedCount = 0;
  return estraverse.replace(block, {
    enter: function (node) {
      if (shouldBeFlattened(node)) {
        var statements = [{
          type: 'VariableDeclaration',
          kind: 'var',
          declarations: [
            {
              type: 'VariableDeclarator',
              id: exports.identifier('pCond' + ++flattenedCount),
              init: node.test
            }
          ]
        }];
        var stillToAdd = [];
        var add = function () {
          if (stillToAdd.length) {
            statements.push({
              type: 'IfStatement',
              test: exports.identifier('pCond' + flattenedCount),
              consequent: exports.blockStatement(stillToAdd)
            });
            stillToAdd = [];
          }
        }
        node.consequent.body.forEach(function (subNode) {
          if (subNode.type === 'IfStatement' && containsReturn(subNode)) {
            add();
            subNode.test = {
              type: 'BinaryExpression',
              operator: '&&',
              left: exports.identifier('pCond' + flattenedCount),
              right: subNode.test
            };
            if (subNode.alternate) {
              subNode.alternate = {
                type: 'IfStatement',
                test: exports.identifier('pCond' + flattenedCount),
                consequent: subNode.alternate
              };
            }
            statements.push(subNode);
          } else {
            stillToAdd.push(subNode);
          }
        });
        add();
        return exports.blockStatement(statements);
      }
    },
    leave: squashBlockStatements
  });
}

exports.generate = function (ast) {
  return escodegen.generate(ast, {
    format: {indent: {style: '  '}},
    comment: true
  }) + '\n';
};
