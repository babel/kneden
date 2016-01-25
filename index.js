// Keep in mind-list:
// - all the main control structures (switch, for, do while, a ? b : c, a || b etc.)
//   - most of these can probably be implemented using conversion to just try/catch, if/else and (semi-)recursion.
// - eval? Probably impossible to support (unless the whole lib is shipped?),
//   but the readme should include a warning.
// - this/arguments: save in a temporary variable when used?

var estraverse = require('estraverse');
var astutils = require('./astutils');
var astrefactor = require('./astrefactor');
var hoist = require('ast-hoist');

module.exports = function compile(code) {
  // parse code
  var ast = astutils.parse(code);

  // transform async functions
  ast = estraverse.replace(ast, {
    enter: function (node) {
      if (astutils.isFunc(node) && node.async) {
        // preparation steps to make the actual conversion to a promise chain
        // easier
        node = astutils.blockify(node);
        // convert iterative loops to their recursive equivalent
        node.body = astrefactor.recursifyAwaitingLoops(node.body);
        // make sure there's at most one return, and if so at the function end.
        node.body = astrefactor.singleExitPoint(node.body);
        // hoist all variable/function declarations up
        node = hoist(node, false);

        // the actual conversion to a promise chain - the heart of kneden
        node = newFunctionBody(node);
        // no awaits anymore
        node.async = false;

        return node;
      }
      // FIXME: fix upstream in ast-hoist?
      if (node.type === 'SequenceExpression' && !node.expressions.length) {
        this.remove();
      }
    },
    // FIXME: also one for ast-hoist?
    leave: removeEmptyExprStmt
  });

  // convert back to code
  return astutils.generate(ast);
};

function removeEmptyExprStmt(node) {
    // fix AST after removing expressions
    if (node.type === 'ExpressionStatement' && !node.expression) {
      this.remove();
    }
}

function newFunctionBody(func) {
  // replace body by moving it into a return Promise.resolve().then(...)
  // .then(...) chain.
  var oldBody = func.body;
  var bodyBegin = [];

  while (isDeclaration((oldBody.body[0] || {}).type)) {
    // move hoisted variables (courtesy of ast-hoist) up into the wrapper
    // function, so variables don't suddenly become inaccessable.
    var decl = oldBody.body.shift();
    bodyBegin.push(decl);
  }

  var shinyNewBody = newBody(oldBody, !func.resolveLoose);
  shinyNewBody.body = bodyBegin.concat(shinyNewBody.body);

  func.body = shinyNewBody;
  return func;
}

function isDeclaration(type) {
  return ['VariableDeclaration', 'FunctionDeclaration'].indexOf(type) !== -1;
}

function newBody(oldBody, resolveStrict) {
  if (!oldBody) {
    // e.g. for .alternate in if statements
    return null;
  }
  var chain = bodyToChain(oldBody, resolveStrict);
  // wrap the body so it fits in the AST
  return astutils.blockStatement([astutils.returnStatement(chain.ast)]);
}

function bodyToChain(oldBody, resolveStrict) {
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
      chain.add(nextInfo.type, [[nextInfo.argName, nextInfo.body]]);
    }
  }

  return chain;
}

function PromiseChain() {
  this.ast = astutils.resolveBase();
}

PromiseChain.prototype.add = function (type, args) {
  this.ast = astutils.chainCall(this.ast, type, args);
}

function NextLinkInfo() {
  // stores info about the next link that you're planning to add to a
  // PromiseChain
  this.reset();
}

NextLinkInfo.prototype.reset = function () {
  this.type = 'then';
  this.body = [];
  this.argName = null;
}

function processStatement(chain, nextInfo, node) {
  // replace any control structures with equivalents that can work with
  // ``await``s. Then make sure those awaits are calculated just before they're
  // needed and passed in.
  node = estraverse.replace(node, {
    enter: function (subNode, parent) {
      var handler = {
        AwaitExpression: processAwaitExpression,
        IfStatement: processIfStatement,
        LogicalExpression: processLogicalExpression,
        TryStatement: processTryStatement
      }[subNode.type];
      if (handler) {
        return handler(chain, nextInfo, subNode, parent);
      }
      return astutils.skipSubFuncs(subNode);
    },
    leave: removeEmptyExprStmt
  });
  if (node) {
    // only if the node still exists, add it to the statements that still need
    // to be added to the chain.
    nextInfo.body.push(node);
  }
}

function processAwaitExpression(chain, nextInfo, subNode, parent) {
  // 1: evaluate the argument as last statement in the curren link
  nextInfo.body.push(astutils.returnStatement(subNode.argument));
  chain.add(nextInfo.type, [[nextInfo.argName, nextInfo.body]]);
  nextInfo.reset();
  // 2: either:
  if (parent.type === 'ExpressionStatement') {
    // remove the result (if the result of the await is thrown away anyway)
    return estraverse.VisitorOption.Remove;
  } else {
    // or make it accessable as a variable
    nextInfo.type = 'then';
    nextInfo.argName = 'pResp';
    return astutils.identifier('pResp');
  }
}

function processIfStatement(chain, nextInfo, subNode) {
  if (astutils.containsAwait(subNode.consequent) || astutils.containsAwait(subNode.alternate)) {
    // subchains inside both the if and else part of the statement
    subNode.consequent = newBody(subNode.consequent, false);
    subNode.alternate = newBody(subNode.alternate, false);
    // add the if statement to the chain as the last item of this link
    processStatement(chain, nextInfo, subNode);
    // and add a new, empty link to the chain
    chain.add(nextInfo.type, [[nextInfo.argName, nextInfo.body]]);
    nextInfo.reset();
    // a new if statement is already in the chain, no need for the old one
    // anymore
    return estraverse.VisitorOption.Remove;
  }
}

function processLogicalExpression(chain, nextInfo, node) {
  // FIXME: more testing required, probably not fixed enough.
  var lazy = ['&&', '||'].indexOf(node.operator) !== -1;
  if (lazy && astutils.containsAwait(node.right)) {
    node.right = estraverse.replace(node.right, {
      enter: function (subNode) {
        if (subNode.type === 'AwaitExpression') {
          return subNode.argument;
        }
        if (subNode.type === 'LogicalExpression') {
          return processLogicalExpression(chain, nextInfo, node);
        }
        return astutils.skipSubFuncs(subNode);
      }
    });
    var func = astutils.functionExpression([], [
      astutils.returnStatement(node.right)
    ])
    node.right = astutils.callExpression(func, []);
    node = astutils.returnStatement(node);
    nextInfo.body.push(node);
    chain.add(nextInfo.type, [[nextInfo.arrgName, nextInfo.body]]);
    nextInfo.reset();

    nextInfo.type = 'then';
    nextInfo.argName = 'pResp';
    return astutils.identifier('pResp');
  }
}

function processTryStatement(chain, nextInfo, subNode) {
  if (astutils.containsAwait(subNode)) {
    // starts a subchain that consists of the try 'block'
    var subChain = bodyToChain(subNode.block);
    // add the catch handler at the end (if one)
    if (subNode.handler) {
      var catchBody = newBody(subNode.handler.body).body;
      subChain.add('catch', [[subNode.handler.param.name, catchBody]]);
    }
    // add the finally handler at the end (if one)
    if (subNode.finalizer) {
      var finalizerChain = bodyToChain(subNode.finalizer);
      var finalizerBody = [astutils.returnStatement(finalizerChain.ast)];
      var throwBody = [astutils.throwStatement(astutils.identifier('pErr'))];
      finalizerChain.add('then', [[null, throwBody]]);
      var errFinalizerBody = [astutils.returnStatement(finalizerChain.ast)];
      subChain.add('then', [[null, finalizerBody], ['pErr', errFinalizerBody]]);
    }

    // add the subchain to the main chain
    nextInfo.body.push(astutils.returnStatement(subChain.ast));
    chain.add(nextInfo.type, [[nextInfo.argName, nextInfo.body]]);
    nextInfo.reset();

    // the original try/catch can be removed
    return estraverse.VisitorOption.Remove;
  }
}
