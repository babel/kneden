import {
  arrayExpression,
  assignmentExpression,
  awaitExpression,
  blockStatement,
  callExpression,
  expressionStatement,
  forInStatement,
  functionExpression,
  identifier,
  ifStatement,
  isIfStatement,
  isReturnStatement,
  logicalExpression,
  memberExpression,
  returnStatement,
  unaryExpression,
  variableDeclaration,
  variableDeclarator,
  whileStatement
} from 'babel-types';

import PromiseChain from './promisechain';
import {NoSubFunctionsVisitor} from './utils';
import {extend} from 'js-extend';

export const RefactorVisitor = extend({
  AwaitExpression(path) {
    // ``return await x`` becomes just ``return x``
    if (isReturnStatement(path.parent)) {
      path.replaceWith(path.node.argument);
    }
  },
  TryStatement(path) {
    // TODO: handle returns! And debug, rewrite, etc. This is messy...

    // changes a try/catch that contains an await in a promise chain that uses
    // .catch()
    if (containsAwait(path)) {
      // make a subchain of the 'try' part
      const subChain = new PromiseChain(true, true);
      path.get('block.body').forEach(subPath => subChain.add(subPath));
      if (path.node.handler) {
        subChain.addNextLink(true);
        // add a catch part, which contains its own catchChain (but that one might
        // be optimized away later on)
        subChain.nextLink.type = 'catch';
        const catchChain = new PromiseChain(true, true);
        subChain.nextLink.params = [path.node.handler.param];
        path.get('handler.body.body').forEach(subPath => catchChain.add(subPath));
        const catchAST = catchChain.toAST();
        // insert catchAST into the main AST - it's not used at this position, but
        // we need a 'path' for the subChain.add() call.
        path.node.handler = awaitStatement(catchAST);
        subChain.add(path.get('handler'));
      }
      if (path.node.finalizer) {
        subChain.addNextLink(true);
        // add a finally part, consisting of a catch followed by a then
        subChain.nextLink.type = 'catch';
        subChain.addNextLink(true);
        path.get('finalizer.body').forEach(subPath => subChain.add(subPath));
      }
      // wrap the subChain, then replace the original try/catch with it.
      path.replaceWith(awaitStatement(subChain.toAST()));
      // TODO: implement finally the right way...
    }
  },
  ConditionalExpression(path) {
    const {node} = path;
    const leftHasAwait = containsAwait(path.get('consequent'));
    const rightHasAwait = containsAwait(path.get('alternate'));
    if (leftHasAwait) {
      node.consequent = wrapAwaitContaining(node.consequent);
    }
    if (rightHasAwait) {
      node.alternate = wrapAwaitContaining(node.alternate);
    }
    if (leftHasAwait || rightHasAwait) {
      path.replaceWith(awaitExpression(path.node));
    }
  },
  IfStatement(path) {
    const {node} = path;
    if (node.consequent.body.some(isIfStatement) && containsReturnOrAwait(path)) {
      // flatten if statements. There are two ways to reach d() in the below.
      // if a() && !b(), and if !a() && !b(). That's problematic during the
      // promise conversion.
      //
      // if (a()) {
      //   if (b()) {
      //     return c();
      //   }
      // }
      // return d();
      //
      // this becomes instead:
      //
      // var _test = a();
      // if (_test && b()) {
      //   return c();
      // }
      // return d();
      //
      // which is better, but not quite the result we want yet. See for that
      // the exit handler of BlockStatement

      const testID = identifier(path.scope.generateUid('test'));
      this.addVarDecl(testID);
      const block = [expressionStatement(assignmentExpression('=', testID, node.test))];

      let stillToAdd = [];
      const clearQueue = () => {
        if (stillToAdd.length) {
          block.push(ifStatement(testID, blockStatement(stillToAdd)));
          stillToAdd = [];
        }
      }
      node.consequent.body.forEach(stmt => {
        if (isIfStatement(stmt)) {
          clearQueue();
          stmt.test = logicalExpression('&&', testID, stmt.test);
          if (stmt.alternate) {
            stmt.alternate = blockStatement([ifStatement(testID, stmt.alternate)]);
          }
          block.push(stmt);
        } else {
          stillToAdd.push(stmt);
        }
      });
      clearQueue();
      extendElse(block[block.length - 1], (node.alternate || {}).body || []);
      path.replaceWithMultiple(block);
    }
  },
  BlockStatement: {
    exit(path) {
      // Converts
      //
      // var _test = a();
      // if (_test && b()) {
      //   return c();
      // }
      // return d();
      //
      // into:
      //
      // var _test = a();
      // if (_test && b()) {
      //   return c();
      // } else {
      //   return d();
      // }
      //
      // ... which has at every point in time only two choices: returning
      // directly out of the function, or continueing on. That's what's required
      // for a nice conversion to Promise chains.
      for (var i = 0; i < path.node.body.length; i++) {
        const subNode = path.node.body[i];
        if (isReturnStatement(subNode)) {
          // remove everything in the block after the return - it's never going
          // to be executed anyway.
          path.node.body.splice(i + 1);
        }
        if (!isIfStatement(subNode)) {
          continue;
        }
        const lastStmt = subNode.consequent.body[subNode.consequent.body.length - 1];
        if (!isReturnStatement(lastStmt)) {
          continue;
        }
        const remainder = path.node.body.splice(i + 1);
        if (!lastStmt.argument) {
          // chop off the soon to be useless return statement
          subNode.consequent.body.splice(-1);
        }
        extendElse(subNode, remainder);
      }
    }
  },
  LogicalExpression(path) {
    // a && (await b) becomes:
    // await a && async function () {
    //   return await b();
    // }()
    if (containsAwait(path.get('right'))) {
      path.node.right = wrapAwaitContaining(path.node.right);
      path.replaceWith(awaitExpression(path.node));
    }
  },
  SequenceExpression(path) {
    // a, await b, await c becomes:
    // await async function() {
    //   a;
    //   await b;
    //   return await c;
    // }
    if (containsAwait(path)) {
      // don't include the last item yet
      const exprs = path.node.expressions;
      const body = exprs.slice(0, exprs.length - 1).map(
        expr => expressionStatement(expr)
      );
      // because that one gets a return statement
      body.push(returnStatement(exprs[exprs.length - 1]));
      path.replaceWith(awaitExpression(wrapFunction(blockStatement(body))));
    }
  },
  DoWhileStatement(path) {
    // converts
    //
    // do {
    //   newBody;
    // } while (node.test)
    //
    // into:
    //
    // await async function _recursive() {
    //   newBody;
    //   if (node.test) {
    //     return await _recursive();
    //   }
    // }()

    refactorLoop(path, false, functionID => {
      const continueBlock = blockStatement([continueStatementEquiv(functionID)])
      path.node.body.body.push(ifStatement(path.node.test, continueBlock));
      path.replaceWith(recursiveWrapFunction(functionID, path.node.body));
    });
  },
  WhileStatement(path) {
    // converts
    //
    // while (node.test) {
    //   newBody;
    // }
    //
    // into:
    //
    // await async function _recursive() {
    //   if (node.test) {
    //     newBody;
    //     return await _recursive();
    //   }
    // }()

    refactorLoop(path, false, functionID => {
      path.node.body.body.push(continueStatementEquiv(functionID));
      const body = blockStatement([ifStatement(path.node.test, path.node.body)]);

      path.replaceWith(recursiveWrapFunction(functionID, body));
    });
  },
  ForStatement(path) {
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
    //   await async function _recursive() {
    //     if (node.test) {
    //       newBody;
    //       node.update;
    //       return await _recursive();
    //     }
    //   }()
    // }
    ifShouldRefactorLoop(path, containsAwait(path.get('update')), () => {
      path.node.body.body.push(expressionStatement(path.node.update));
      path.replaceWithMultiple([
        expressionStatement(path.node.init),
        whileStatement(path.node.test, path.node.body)
      ]);
    });
  },
  ForInStatement(path) {
    // converts
    // for (node.left in node.right) {
    //   newBody;
    // }
    //
    // info:
    //
    // var _items = [];
    // for (var _item in node.right) {
    //   _items.push(_item);
    // }
    // _items.reverse();
    // await async function _recursive() {
    //   if (_items.length) {
    //     node.left = _items.pop();
    //     newBody;
    //     return await _recursive();
    //   }
    // }

    ifShouldRefactorLoop(path, false, () => {
      // convert for loop body to while loop body
      const itemsID = identifier(path.scope.generateUid('items'));
      const popID = memberExpression(itemsID, identifier('pop'));
      const popCall = callExpression(popID, []);
      const assignment = assignmentExpression('=', path.node.left, popCall);
      path.node.body.body.unshift(expressionStatement(assignment));

      // convert to while loop with some stuff before it
      const pushID = memberExpression(itemsID, identifier('push'));
      const itemID = identifier(path.scope.generateUid('item'));
      const reverseID = memberExpression(itemsID, identifier('reverse'));
      const lengthID = memberExpression(itemsID, identifier('length'));

      path.replaceWithMultiple([
        variableDeclaration('var', [variableDeclarator(itemsID, arrayExpression([]))]),
        forInStatement(
          variableDeclaration('var', [variableDeclarator(itemID)]),
          path.node.right,
          blockStatement([expressionStatement(callExpression(pushID, [itemID]))])
        ),
        expressionStatement(callExpression(reverseID, [])),
        whileStatement(lengthID, path.node.body)
      ]);
    });
  },
  ThisExpression(path) {
    path.replaceWith(this.thisID);
    this.used.thisID = true;
  },
  Identifier(path) {
    if (path.node.name === 'arguments' && !path.scope.hasOwnBinding('arguments')) {
      path.replaceWith(this.argumentsID);
      this.used.argumentsID = true;
    }
  }
}, NoSubFunctionsVisitor);

function recursiveWrapFunction(functionID, body) {
  const func = wrapFunction(body);
  func.callee.id = functionID;

  return awaitStatement(func);
}

function ifShouldRefactorLoop(path, extraCheck, handler) {
  if (extraCheck || containsAwait(path.get('body'))) {
    handler();
  }
}

function refactorLoop(path, extraCheck, handler) {
  ifShouldRefactorLoop(path, extraCheck, () => {
    const functionID = identifier(path.scope.generateUid('recursive'));
    path.get('body').traverse(BreakContinueReplacementVisitor, {functionID});
    handler(functionID);
  });
}

const BreakContinueReplacementVisitor = extend({
  // replace continue/break with their recursive equivalents
  BreakStatement(path) {
    // FIXME: no way to compare it to a real return. Those don't work anyway at
    // the moment.
    path.replaceWith(returnStatement());
  },
  ContinueStatement(path) {
    path.replaceWith(continueStatementEquiv(this.functionID));
  }
}, NoSubFunctionsVisitor);

const continueStatementEquiv =
  funcID => returnStatement(awaitExpression(callExpression(funcID, [])));

const wrapIfBranch =
  branch => blockStatement([returnStatement(wrapFunction(branch))]);

function wrapFunction(body) {
  const func = functionExpression(null, [], body, false, true);
  func.dirtyAllowed = true;
  return callExpression(func, []);
}

const containsReturnOrAwait = matcher(['ReturnStatement', 'AwaitExpression']);
const containsAwait = matcher(['AwaitExpression']);

function matcher(types) {
  const MatchVisitor = extend({}, NoSubFunctionsVisitor);
  types.forEach(type => {
    MatchVisitor[type] = function (path) {
      this.match.found = true;
      path.stop();
    };
  });
  return function (path) {
    if (!path.node) {
      return false;
    }
    if (types.indexOf(path.node.type) !== -1) {
      return true;
    }
    const match = {}
    path.traverse(MatchVisitor, {match});
    return match.found;
  }
}

const awaitStatement = arg => expressionStatement(awaitExpression(arg));

function extendElse(ifStmt, extraBody) {
  const body = ((ifStmt.alternate || {}).body || []).concat(extraBody);
  if (body.length) {
    ifStmt.alternate = blockStatement(body);
  }
}

const wrapAwaitContaining =
  node => wrapFunction(blockStatement([returnStatement(node)]));

export const IfRefactorVisitor = extend({
  IfStatement(path) {
    if (!path.node.consequent.body.length && path.node.alternate.body.length) {
      path.node.consequent = path.node.alternate;
      path.node.alternate = null;
      path.node.test = unaryExpression('!', path.node.test);
    }
    const ifContainsAwait = containsAwait(path.get('consequent'));
    const elseContainsAwait = containsAwait(path.get('alternate'));

    const {node} = path;
    if (ifContainsAwait) {
      node.consequent = wrapIfBranch(node.consequent);
    }
    if (elseContainsAwait) {
      node.alternate = wrapIfBranch(node.alternate);
    }
    if (ifContainsAwait || elseContainsAwait) {
      path.replaceWith(awaitExpression(wrapFunction(blockStatement([node]))));
    }
  }
}, NoSubFunctionsVisitor)
