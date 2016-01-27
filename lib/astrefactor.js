// TODO: split out recursify & flatten if statement functions into their own
// libraries? Might be usable for others...

var astutils = require('./astutils');

exports.recursifyAwaitingLoops = function (body) {
  // for every loop that contains await: convert from iterative statement to a
  // recursive (async) function.
  return astutils.replaceSkippingFuncs(body, function (node) {
    if (!(astutils.isLoop(node) && astutils.containsAwait(node))) {
      return;
    }
    var newBody = replaceBreakContinue(node.body);
    // loop-specific stuff
    var handler = {
      DoWhileStatement: processDoWhileStatement,
      ForInStatement: processForInStatement,
      ForStatement: processForStatement,
      WhileStatement: processWhileStatement
    }[node.type];
    return handler(node, newBody);
  }, squashBlockStatements);
}

function replaceBreakContinue(node) {
  return astutils.replaceSkippingFuncs(node, function (subNode) {
    // replace continue/break with their recursive equivalents
    if (subNode.type === 'BreakStatement') {
      return astutils.returnStatement();
    }
    if (subNode.type === 'ContinueStatement') {
      return continueStatementEquiv();
    }
    return astutils.skipSubFuncs(node)
  })
}

function processDoWhileStatement(node, newBody) {
  // converts
  //
  // do {
  //   newBody;
  // } while (node.test)
  //
  // into:
  //
  // await async function pRecursive() {
  //   newBody;
  //   if (node.test) {
  //     return await pRecursive();
  //   }
  // }()
  var continueBlock = astutils.blockStatement([continueStatementEquiv()]);
  newBody.body.push(astutils.ifStatement(node.test, continueBlock));
  return awaitStatement(recursiveWrapFunction(newBody.body));
}

function recursiveWrapFunction(body) {
  var node = wrapFunction(body);
  node.callee.resolveLoose = true;
  node.callee.id = astutils.identifier('pRecursive');
  return node;
}

function wrapFunction(body) {
  var func = astutils.functionExpression([], body);
  func.async = true;
  return astutils.callExpression(func, []);
}

function awaitStatement(func) {
  return astutils.expressionStatement(astutils.awaitExpression(func));
}

function processForInStatement(node, newBody) {
  // converts
  // for (node.left in node.right) {
  //   newBody;
  // }
  //
  // info:
  //
  // {
  //   var pItems = [];
  //   for (var pItem in node.right) {
  //     pItems.push(pItem);
  //   }
  //   pItems.reverse();
  //   await async function pRecursive() {
  //     if (pItems.length) {
  //       node.left = pItems.pop();
  //       newBody;
  //       return await pRecursive();
  //     }
  //   }
  // }
  var pItems = astutils.identifier('pItems');
  var push = astutils.memberExpression(pItems, astutils.identifier('push'));
  var reverse = astutils.memberExpression(pItems, astutils.identifier('reverse'));
  var pop = astutils.memberExpression(pItems, astutils.identifier('pop'));
  var length = astutils.memberExpression(pItems, astutils.identifier('length'));

  var pushCall = astutils.callExpression(push, [astutils.identifier('pItem')]);
  var reverseCall = astutils.callExpression(reverse, []);
  var popCall = astutils.callExpression(pop, []);

  var id;
  var block = [];
  if (node.left.type === 'VariableDeclaration') {
    id = node.left.declarations[0].id;
    block.push(node.left);
  } else {
    id = node.left;
  }
  var assignment = astutils.assignmentExpression(id, popCall);
  newBody.body.unshift(astutils.expressionStatement(assignment));

  block.push.apply(block, [
    astutils.variableDeclaration('pItems', astutils.arrayExpression([])),
    astutils.forInStatement(
      astutils.variableDeclaration('pItem'),
      node.right,
      [astutils.expressionStatement(pushCall)]
    ),
    astutils.expressionStatement(reverseCall),
    processWhileStatement({test: length}, newBody)
  ]);

  return astutils.blockStatement(block);
}

function processForStatement(node, newBody) {
  // converts
  //
  // for(node.init, node.test, node.update) {
  //   newBody;
  // }
  //
  // into:
  //
  // {
  //   node.init;
  //   await async function pRecursive() {
  //     if (node.test) {
  //       newBody;
  //       node.update;
  //       return await pRecursive();
  //     }
  //   }()
  // }
  newBody.body.push(astutils.expressionStatement(node.update));
  return astutils.blockStatement([
    astutils.expressionStatement(node.init),
    processWhileStatement(node, newBody)
  ]);
}

function processWhileStatement(node, newBody) {
  // converts
  //
  // while (node.test) {
  //   newBody;
  // }
  //
  // into:
  //
  // await async function pRecursive() {
  //   if (node.test) {
  //     newBody;
  //     return await pRecursive();
  //   }
  // }()

  newBody.body.push(continueStatementEquiv());
  return awaitStatement(recursiveWrapFunction([
    astutils.ifStatement(node.test, newBody)
  ]));
}

function continueStatementEquiv() {
  var call = awaitCall(astutils.identifier('pRecursive'), []);
  return astutils.returnStatement(call);
}

function awaitCall(callee, args) {
  var func = astutils.callExpression(callee, args);
  return astutils.awaitExpression(func);
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

exports.switchToConditionals = function (block) {
  return astutils.replaceSkippingFuncs(block, function (node) {
    if (node.type === 'SwitchStatement') {
      replaceBreakContinue(node);

      var tests = [];
      var statements = [];

      var indexOf = astutils.memberExpression(
        astutils.arrayExpression(tests),
        astutils.identifier('indexOf')
      );
      var call = astutils.callExpression(indexOf, [node.discriminant]);
      statements.push(astutils.variableDeclaration('pIdx', call));

      var i = -1;
      var pIdx = astutils.identifier('pIdx');
      node.cases.forEach(function (caseNode) {
        if (caseNode.test) {
          tests.push(caseNode.test);
          i++;
        }
        if (caseNode.consequent.length) {
          var equal = astutils.binaryExpression('!==', pIdx, astutils.minus(1));
          var cmp = astutils.binaryExpression('<=', pIdx, astutils.literal(i));
          var test = astutils.logicalExpression('&&', equal, cmp);
          if (!caseNode.test) {
            // -1 is fine for the default case
            test = cmp;
          }
          var block = astutils.blockStatement(caseNode.consequent);
          statements.push(astutils.ifStatement(test, block));
        }
      });

      var func = wrapFunction(statements);
      func.callee.resolveLoose = true;
      return astutils.expressionStatement(astutils.awaitExpression(func));
    }
  });
};

exports.flattenReturningIfs = function (block) {
  var flattenedCount = 0;
  return astutils.replaceSkippingFuncs(block, function (node) {
    if (!shouldBeFlattened(node)) {
      return;
    }
    // the test of the outer variable serves as a guard
    var block = new FlattenedIf('pCond' + ++flattenedCount, node.test, node.alternate);
    node.consequent.body.forEach(function (subNode) {
      block.add(subNode);
    });
    var ast = block.toAST();
    return ast;
  }, squashBlockStatements);
}

function shouldBeFlattened(node) {
  // Does ``node`` (IfStatement) have a descendant (IfStatement) that contains
  // a return in its consequent?
  return node.type === 'IfStatement' && astutils.matches(node.consequent, function (subNode) {
    return subNode.type === 'IfStatement' && containsReturn(subNode);
  });
}

function containsReturn(node) {
  // does node have a descendant that's a ReturnStatement?
  return astutils.matches(node, function (subNode) {
    return subNode.type === 'ReturnStatement';
  });
}

function FlattenedIf(name, guard, alternate) {
  this._guardID = astutils.identifier(name);
  this._queue = [];
  this._statements = [
    astutils.variableDeclaration(name, guard)
  ];
  this._elseBody = (alternate || {}).body || [];
}

FlattenedIf.prototype._clearQueue = function () {
  // adds kept back statements to the main collection, guarded by the
  // saved test
  if (this._queue.length) {
    var block = astutils.blockStatement(this._queue);
    this._statements.push(astutils.ifStatement(this._guardID, block));
    this._queue = [];
  }
}

FlattenedIf.prototype.add = function (stmt) {
  if (stmt.type === 'IfStatement' && containsReturn(stmt.consequent)) {
    this._clearQueue();
    // change the inner if statement's test so it includes the outer
    // statement's test and add it to the main collection of statements.
    stmt.test = astutils.logicalExpression('&&', this._guardID, stmt.test);
    if (stmt.alternate) {
      stmt.alternate = astutils.ifStatement(this._guardID, stmt.alternate);
    }
    this._statements.push(stmt);
  } else {
    this._queue.push(stmt);
  }
}

FlattenedIf.prototype.toAST = function () {
  // add the remaining kept back statements
  this._clearQueue();
  addToElse(this._statements[this._statements.length - 1], this._elseBody);
  // and bundle everything in a block
  return astutils.blockStatement(this._statements);
}

function addToElse(node, body) {
  var elseStmts = [];
  if (node.alternate) {
    if (node.alternate.type === 'BlockStatement') {
      elseStmts = node.alternate.body;
    } else {
      elseStmts.push(node.alternate);
    }
  }
  elseStmts.push.apply(elseStmts, body);
  if (elseStmts.length) {
    node.alternate = astutils.blockStatement(elseStmts);
  }
}

exports.directlyExitable = function (block) {
  // makes sure that every return will directly exit the function, even when in
  // a promise chain. It does this by placing everything after a return in an if
  // statement in an else clause, after flattening the if statement structure
  // first.
  //
  // TODO: think on try/catch! Are they supported already, or are there edge
  // cases?

  block = exports.flattenReturningIfs(block);
  block = elsifyReturn(block);

  return block;
}

function elsifyReturn(block) {
  stripAfterReturn(block.body);

  for (var i = 0; i < block.body.length; i++) {
    var node = block.body[i];

    if (node.type === 'IfStatement' && containsReturn(node.consequent)) {
      stripAfterReturn(node.consequent.body);

      addToElse(node, block.body.splice(i + 1));
      if (node.alternate) {
        elsifyReturn(node.alternate);
      }

      // optimalization:
      // if the result is of the form if (a) {} else {/* statements */}, invert
      // the test and swap the bodies.
      if (!node.consequent.body.length) {
        node.consequent = node.alternate;
        node.alternate = null;
        node.test = {
          type: 'UnaryExpression',
          operator: '!',
          argument: node.test
        };
      }
    }
  }
  return block;
}

function stripAfterReturn(body) {
  for (var i = 0; i < body.length; i++) {
    var node = body[i];
    if (node.type === 'ReturnStatement') {
      // only strip the return itself if it doesn't have an argument
      body.splice(i + !!node.argument);
    }
  }
}

exports.wrapLogicalExprs = function (block) {
  return astutils.replaceSkippingFuncs(block, function (node) {
    if (node.type === 'LogicalExpression' && astutils.containsAwait(node.right)) {
      // a && (await b) becomes:
      // await a && async function () {
      //   return await b();
      // }()
      node.right = wrapFunction([astutils.returnStatement(node.right)]);
      return astutils.awaitExpression(node);
    }
  });
};

exports.wrapConditionalExprs = function (block) {
  return astutils.replaceSkippingFuncs(block, function (node) {
    if (node.type === 'ConditionalExpression') {
      var consequentHasAwait = astutils.containsAwait(node.consequent);
      var alternateHasAwait = astutils.containsAwait(node.alternate);
      if (consequentHasAwait) {
        node.consequent = wrapFunction([astutils.returnStatement(node.consequent)]);
      }
      if (alternateHasAwait) {
        node.alternate = wrapFunction([astutils.returnStatement(node.alternate)]);
      }
      if (consequentHasAwait || alternateHasAwait) {
        return astutils.awaitExpression(node);
      }
    }
  });
}

exports.wrapSequenceExprs = function (block) {
  return astutils.replaceSkippingFuncs(block, function (node) {
    if (node.type === 'SequenceExpression' && astutils.containsAwait(node)) {
      // a, await b, await c becomes:
      // await async function() {
      //   a;
      //   await b;
      //   return await c;
      // }
      var exprs = node.expressions
      // don't include the last item yet
      var body = exprs.slice(0, exprs.length - 1).map(function (expr) {
        return astutils.expressionStatement(expr);
      });
      // because that one gets a return statement
      body.push(astutils.returnStatement(exprs[exprs.length - 1]));
      return astutils.awaitExpression(wrapFunction(body));
    }
  });
}

/*
See index.js TODO near the top for why this is still here.

exports.wrapIfStatements = function (block) {
  // converts:
  //
  // if (a) {
  //   await a;
  // }
  //
  // into:
  //
  // await async function () {
  //   if (a) {
  //     return await async function () {
  //       await a;
  //     }();
  //   }
  // }()
  return astutils.replaceSkippingFuncs(block, function (node) {
    if (node.type === 'IfStatement' && !node.safed) {
      var consequentHasAwait = astutils.containsAwait(node.consequent);
      var alternateHasAwait = astutils.containsAwait(node.alternate);
      if (consequentHasAwait) {
        node.consequent = wrapIfBranch(node.consequent);
      }
      if (alternateHasAwait) {
        node.alternate = wrapIfBranch(node.alternate);
      }
      if (consequentHasAwait || alternateHasAwait) {
        node.safed = true;
        return awaitStatement(wrapFunction([node]), []);
      }
    }
  });
}

function wrapIfBranch(branch) {
  var func = wrapFunction(branch.body);
  func.callee.resolveLoose = true;
  return astutils.blockStatement([
    astutils.returnStatement(astutils.awaitExpression(func))
  ]);
}
*/
