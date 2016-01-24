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
  return contains(node, function (subNode) {
    return subNode.type === 'AwaitExpression';
  });
};

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
  // TODO: same for if & loops
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
  // convert loops to recursion
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
    leave: function(node) {
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
  });
}

exports.singleExitPoint = function (body) {
/*  return estraverse.replace(body, {
    enter: function (node) {
      for (var i = 0; i < node.body.length; i++) {
        var subNode = node.body[i];
        if (subNode.type === 'IfStatement' && containsReturn(subNode)) {
        }
      }
    }
  });*/
  return body;
}

function contains(node, check) {
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

//function containsReturn(node) {
//  return contains(node, function (subNode) {
//    return subNode.type === 'ReturnStatement';
//  })
//}

exports.flattenIfs = function () {

}

exports.generate = function (ast) {
  return escodegen.generate(ast, {
    format: {indent: {style: '  '}},
    comment: true
  }) + '\n';
};
