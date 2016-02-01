import {
  awaitExpression,
  blockStatement,
  callExpression,
  ensureBlock,
  expressionStatement,
  identifier,
  ifStatement,
  returnStatement,
  whileStatement
} from 'babel-types';
import template from 'babel-template';
import {extend} from 'js-extend';

import {
  awaitStatement,
  containsAwait,
  NoSubFunctionsVisitor,
  wrapFunction
} from './utils';

export default {
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
    //     node.body;
    //     return await _recursive();
    //   }
    // }

    ifShouldRefactorLoop(path, false, () => {
      path.replaceWithMultiple(forInEquiv({
        ITEMS: identifier(path.scope.generateUid('items')),
        ITEM: identifier(path.scope.generateUid('item')),
        LEFT: path.node.left,
        RIGHT: path.node.right,
        BODY: path.node.body
      }));
    });
  }
};

const forInEquiv = template(`
  var ITEMS = [];
  for (var ITEM in RIGHT) {
    ITEMS.push(ITEM);
  }
  ITEMS.reverse();
  while(ITEMS.length) {
    LEFT = ITEMS.pop();
    BODY;
  }
`);

function recursiveWrapFunction(functionID, body) {
  const func = wrapFunction(body);
  func.callee.id = functionID;

  return awaitStatement(func);
}

function ifShouldRefactorLoop(path, extraCheck, handler) {
  ensureBlock(path.node);
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

const continueStatementEquiv =
  funcID => returnStatement(awaitExpression(callExpression(funcID, [])));

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
  // TODO: don't touch subloops - maybe something like:
  //Loop(path) {
  //  path.skip();
  //}
}, NoSubFunctionsVisitor);
