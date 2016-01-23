// Keep in mind-list:
// - eval? Probably impossible to support, but should at least throw error (escope for detection?)
// - arguments: save in a temporary variable if used? Same for 'this'...
// - all the main control structures (if/else, switch, for, do while, while, a ? b : c, a || b, return, break, continue, try/catch etc.)
//   - most of these can probably be implemented using conversion to just try/catch, if/else and (semi-)recursion

var estraverse = require('estraverse');
var astutils = require('./astutils');

var RESULT_NAME = 'pResp';

module.exports = function compile(code) {
  var ast = astutils.parse(code);
  ast = astutils.hoist(ast);

  estraverse.traverse(ast, {
    enter: function (node) {
      if (astutils.isFunc(node) && node.async) {
        node.body = newBody(node);
        node.async = false;
      }
    }
  });

  return astutils.generate(ast);
};

function newBody(func) {
  var oldBody = func.body;
  var result = [];

  while (['VariableDeclaration', 'FunctionDeclaration'].indexOf((oldBody.body[0] || {}).type) !== -1) {
    // move hoisted variables (courtesy of ast-hoist) up into the wrapper
    // function
    var decl = oldBody.body.shift();
    result.push(decl);
  }

  var chain = astutils.resolveBase();
  var current = [];
  var type = 'then';
  function addToChain() {
    var params = {
      then: [],
      thenWithArgs: [astutils.identifier(RESULT_NAME)]
    };
    chain = astutils.chainCall(chain, 'then', params[type], current);
    current = [];
    type = 'then';
  }
  if (oldBody.body.length) {
    oldBody.body.forEach(function (node) {
      node = estraverse.replace(node, {
        enter: function (subNode, parent) {
          if (astutils.isFunc(subNode)) {
            this.skip();
          }
          if (subNode.type === 'AwaitExpression') {
            current.push(astutils.returnStatement(subNode.argument));
            addToChain();
            if (parent.type === 'ExpressionStatement') {
              this.remove();
            } else {
              type = 'thenWithArgs';
              return astutils.identifier(RESULT_NAME);
            }
          }
        },
        leave: function (subNode) {
          if (subNode.type === 'ExpressionStatement' && !subNode.expression) {
            this.remove();
          }
        }
      });
      if (node) {
        current.push(node);
      }
    });
    addToChain();
  }

  result.push(astutils.returnStatement(chain));
  return astutils.blockStatement(result);
}
