var estraverse = require('estraverse');
var astutils = require('./astutils');

exports.recursifyAwaitingLoops = function (body) {
  // for every loop that contains await: convert from iterative statement to a
  // recursive (async) function.
  return estraverse.replace(body, {
    enter: function (node) {
      if (!(isLoop(node) && astutils.containsAwait(node))) {
        return astutils.skipSubFuncs(node);
      }
      // a loop can be thought of as having a continue as a last statement
      node.body.body.push({type: 'ContinueStatement'});
      var newBody = estraverse.replace(node.body, {
        // replace continue/break with their recursive equivalents
        enter: function (subNode) {
          if (subNode.type === 'BreakStatement') {
            return astutils.returnStatement();
          }
          if (subNode.type === 'ContinueStatement') {
            return astutils.blockStatement([
              awaitCallStatement(astutils.identifier('pRecursive'), []),
              astutils.returnStatement()
            ]);
          }
          return astutils.skipSubFuncs(node)
        }
      });
      // loop-specific stuff
      // TODO: generalize other loop types into while loops instead? Is a mapping
      // worth it here for 1-2, maybe 3 different loop types that aren't converted
      // into a different loop type?
      var handler = {
        WhileStatement: processWhileStatement
      }[node.type];
      if (handler) {
        return handler(node, newBody);
      }
    },
    leave: squashBlockStatements
  });
}

function isLoop(node) {
  return [
    'WhileStatement',
    'DoWhileStatement',
    'ForStatement',
    'ForInStatement'
  ].indexOf(node.type) !== -1;
}

function awaitCallStatement(callee, args) {
  return {
    type: 'ExpressionStatement',
    expression: {
      type: 'AwaitExpression',
      argument: astutils.callExpression(callee, args)
    }
  };
}

function processWhileStatement(node, newBody) {
  // converts a while loop into a recursive (async) function with an if-guard
  // over the body.
  return awaitCallStatement(asyncRecursiveFunc([
    astutils.ifStatement(node.test, newBody)
  ]), []);
}

function asyncRecursiveFunc(body) {
  //TODO: reuse for other loops!
  var node = astutils.functionExpression([], body);
  node.async = true;
  node.resolveLoose = true;
  node.id = astutils.identifier('pRecursive');
  return node;
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

exports.flattenReturningIfs = function (block) {
  var flattenedCount = 0;
  return estraverse.replace(block, {
    enter: function (node) {
      if (!shouldBeFlattened(node)) {
        return;
      }
      // save the test of the outer if statement in a variable
      var statements = [
        astutils.variableDeclaration('pCond' + ++flattenedCount, node.test)
      ];
      var stillToAdd = [];
      // adds kept back statements to the main collection, guarded by the
      // saved test
      var guard = astutils.identifier('pCond' + flattenedCount);
      var add = function () {
        if (stillToAdd.length) {
          var block = astutils.blockStatement(stillToAdd);
          statements.push(astutils.ifStatement(guard, block));
          stillToAdd = [];
        }
      }
      node.consequent.body.forEach(function (subNode) {
        if (subNode.type === 'IfStatement' && containsReturn(subNode)) {
          add();
          // change the inner if statement's test so it includes the outer
          // statement's test and add it to the main collection of statements.
          subNode.test = astutils.andOp(guard, subNode.test);
          if (subNode.alternate) {
            subNode.alternate = astutils.ifStatement(guard, subNode.alternate);
          }
          statements.push(subNode);
        } else {
          // a normal statement which can be added later
          stillToAdd.push(subNode);
        }
      });
      // add the remaining kept back statements
      add();
      // and bundle everything in a block (which will be flattened away by
      // leave())
      return astutils.blockStatement(statements);
    },
    leave: squashBlockStatements
  });
}

function containsReturn(node) {
  // does node have a descendant that's a ReturnStatement?
  return astutils.matches(node, function (subNode) {
    return subNode.type === 'ReturnStatement';
  });
}

function shouldBeFlattened(node) {
  // Does ``node`` (IfStatement) have a descendant (IfStatement) that contains
  // a return?
  return astutils.matches(node, function (subNode) {
    return node !== subNode && node.type === 'IfStatement' && subNode.type === 'IfStatement' && containsReturn(subNode);
  });
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
    if (node.type !== 'IfStatement') {
      continue;
    }
    var retNode = stripAfterReturn(node.consequent.body);
    if (!retNode) {
      continue;
    }
    // at this point, ``node`` is an if statement of which the consequent body
    // has as its last statement ``retNode``.
    if (retNode.argument) {
      // TODO
    } else {
      // remove return statement
      node.consequent.body.splice(-1);
    }
    // move everything after the if statement into the else clause (prepending
    // any existing else clause statements)
    var existingElseBody = (node.alternate || {}).body || [];
    var elseBody = existingElseBody.concat(body.splice(i + 1));
    if (elseBody.length) {
      node.alternate = astutils.blockStatement(elseBody);
      annihilateReturns(node.alternate.body);
    }

    // if the result is of the form if (a) {} else {/* statements */}, invert
    // the test and swap the bodies.
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
