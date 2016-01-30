import {
  awaitExpression,
  blockStatement,
  callExpression,
  functionExpression,
  isAwaitExpression,
  returnStatement
} from 'babel-types';

import {NoSubFunctionsVisitor} from './utils';
import {extend} from 'js-extend';

export const RefactorVisitor = extend({
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
    const leftAwait = {};
    const rightAwait = {};
    path.get('consequent').traverse(MatchAwaitVisitor, {match: leftAwait});
    path.get('alternate').traverse(MatchAwaitVisitor, {match: rightAwait});

    const {node} = path;
    if (leftAwait.found) {
      node.consequent = wrapIfBranch(node.consequent);
    }
    if (rightAwait.found) {
      node.alternate = wrapIfBranch(node.alternate);
    }
    if (leftAwait.found || rightAwait.found) {
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
  WhileStatement(path) {
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

    refactorLoop(path, () => {
      // HERE.
    });

    newBody.body.push(continueStatementEquiv());
    return awaitStatement(recursiveWrapFunction([
      astutils.ifStatement(node.test, newBody)
    ]));

  }
}, NoSubFunctionsVisitor);

function wrapIfBranch(node) {
  return blockStatement([returnStatement(wrapFunction(node))]);
}

const MatchAwaitVisitor = extend({
  AwaitExpression(path) {
    this.match.found = true;
    path.stop();
  }
}, NoSubFunctionsVisitor);

function wrapFunction(body) {
  const func = functionExpression(null, [], body, false, true);
  func.dirtyAllowed = true;
  return callExpression(func, []);
}
