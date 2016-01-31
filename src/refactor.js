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
  isAwaitExpression,
  isReturnStatement,
  memberExpression,
  returnStatement,
  variableDeclaration,
  variableDeclarator,
  whileStatement
} from 'babel-types';

import PromiseChain from './promisechain';
import {NoSubFunctionsVisitor, awaitStatement, containsAwait} from './utils';
import {extend} from 'js-extend';

export default extend({
  AwaitExpression(path) {
    // ``return await x`` becomes just ``return x``
    if (isReturnStatement(path.parent)) {
      path.replaceWith(path.node.argument);
    }
  },
  TryStatement(path) {
    // changes a try/catch that contains an await in a promise chain that uses
    // .catch()
    if (containsAwait(path)) {
      const subChain = new PromiseChain(true, true);
      path.get('block.body').forEach(subPath => subChain.add(subPath));
      subChain.addNextLink();
      subChain.nextLink.type = 'catch';
      subChain.nextLink.params = [path.node.handler.param];
      const catchChain = new PromiseChain(true, true);
      path.get('handler.body.body').forEach(subPath => catchChain.add(subPath));
      const catchAST = catchChain.toAST();
      // insert into the main AST - it's not used at this position, but we
      // need a 'path' for the subChain.add() call.
      path.node.handler.body.body = [awaitStatement(catchAST)];
      subChain.add(path.get('handler.body.body')[0]);
      path.replaceWith(awaitStatement(subChain.toAST()));
    }
  },
  ConditionalExpression(path) {
    const {node} = path;
    const leftIsAwait = isAwaitExpression(path.node.consequent);
    const rightIsAwait = isAwaitExpression(path.node.alternate);
    if (leftIsAwait) {
      node.consequent = node.consequent.argument;
    }
    if (rightIsAwait) {
      node.alternate = node.alternate.argument;
    }
    if (leftIsAwait || rightIsAwait) {
      path.replaceWith(awaitExpression(path.node));
    }
  },
  IfStatement(path) {
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
  },
  LogicalExpression(path) {
    if (isAwaitExpression(path.node.right)) {
      // a && (await b) becomes:
      // await (await a && b());
      // }()
      path.node.right = path.node.right.argument;
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
    path.replaceWith(returnStatement());
  },
  ContinueStatement(path) {
    path.replaceWith(continueStatementEquiv(this.functionID));
  }
}, NoSubFunctionsVisitor);

function continueStatementEquiv(functionID) {
  const call = awaitExpression(callExpression(functionID, []));
  return returnStatement(call);
}

function wrapIfBranch(node) {
  return blockStatement([returnStatement(wrapFunction(node))]);
}

function wrapFunction(body) {
  const func = functionExpression(null, [], body, false, true);
  func.dirtyAllowed = true;
  return callExpression(func, []);
}
