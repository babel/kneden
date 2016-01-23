// Keep in mind-list:
// - eval? Probably impossible to support, but should at least throw error (escope for detection?)
// - arguments: save in a temporary variable if used? Same for 'this'...
// - all the main control structures (if/else, switch, for, do while, while, a ? b : c, a || b, return, break, continue, try/catch etc.)
//   - most of these can probably be implemented using conversion to just try/catch, if/else and (semi-)recursion

var estraverse = require('estraverse');
var astutils = require('./astutils');

var RESULT_NAME = 'pResp';

module.exports = function compile(code) {
  // parse & preprocess code
  var ast = astutils.parse(code);
  ast = astutils.hoist(ast);

  // transform async functions
  estraverse.traverse(ast, {
    enter: function (node) {
      if (astutils.isFunc(node) && node.async) {
        node.body = newFunctionBody(node);
        node.async = false;
      }
    }
  });

  // convert back to code
  return astutils.generate(ast);
};

function newFunctionBody(func) {
  // replace body by moving it into a return Promise.resolve().then(...)
  // .then(...) chain.
  var oldBody = func.body;
  var bodyBegin = [];

  while (['VariableDeclaration', 'FunctionDeclaration'].indexOf((oldBody.body[0] || {}).type) !== -1) {
    // move hoisted variables (courtesy of ast-hoist) up into the wrapper
    // function, so variables don't suddenly become inaccessable.
    var decl = oldBody.body.shift();
    bodyBegin.push(decl);
  }

  var result = newBody(oldBody, true);
  result.body = bodyBegin.concat(result.body);
  return result;
}

function newBody(oldBody, resolveStrict) {
  if (!oldBody) {
    return null;
  }
  // start chain
  var chain = new PromiseChain();
  var nextInfo = new NextLinkInfo();
  // don't add a .then(...) function if the body is completely empty.
  if (oldBody.body.length) {
    oldBody.body.forEach(function (stmt) {
      processStatement(chain, nextInfo, stmt);
    });
    if (resolveStrict || nextInfo.body.length) {
      // add the remainder as a last item to the chain
      chain.add(nextInfo.type, nextInfo.body);
    }
  }

  // wrap the body so it fits in the AST
  return astutils.blockStatement([astutils.returnStatement(chain.ast)]);
}

function PromiseChain() {
  this.ast = astutils.resolveBase();
}

PromiseChain.prototype.add = function (type, body) {
  var params = {
    then: [],
    thenWithArgs: [astutils.identifier(RESULT_NAME)]
  };
  this.ast = astutils.chainCall(this.ast, 'then', params[type], body);
}

function NextLinkInfo() {
  // stores info about the next link that you're planning to add to a
  // PromiseChain
  this.reset();
}

NextLinkInfo.prototype.reset = function () {
  this.type = 'then';
  this.body = [];
}

function processStatement(chain, nextInfo, node) {
  // replace any control structures with equivalents that can work with
  // ``await``s. Then make sure those awaits are calculated just before they're
  // needed and passed in.
  node = estraverse.replace(node, {
    enter: function (subNode, parent) {
      if (astutils.isFunc(subNode)) {
        // don't interfere with other functions - they're handled separately.
        this.skip();
      }
      if (subNode.type === 'IfStatement' && astutils.containsAwait(subNode)) {
        subNode.consequent = newBody(subNode.consequent, false);
        subNode.alternate = newBody(subNode.alternate, false);
        nextInfo.body.push(subNode);
        chain.add(nextInfo.type, nextInfo.body);
        nextInfo.reset();
        this.remove();
      }
      if (subNode.type === 'AwaitExpression') {
        nextInfo.body.push(astutils.returnStatement(subNode.argument));
        chain.add(nextInfo.type, nextInfo.body);
        nextInfo.reset();
        // FIXME: handle indirect parents. This is a non-thought out hack...
        if (parent.type === 'ExpressionStatement') {
          this.remove();
        } else {
          nextInfo.type = 'thenWithArgs';
          return astutils.identifier(RESULT_NAME);
        }
      }
    },
    leave: function (subNode) {
      // fix AST after removing standalone await expressions
      if (subNode.type === 'ExpressionStatement' && !subNode.expression) {
        this.remove();
      }
    }
  });
  if (node) {
    // only if the node still exists, add it to the statements that still need
    // to be added to the chain.
    nextInfo.body.push(node);
  }
}
