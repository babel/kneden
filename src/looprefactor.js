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
  matcher,
  wrapFunction
} from './utils';

export default {
  LabeledStatement: {
    // Babel seems to auto-remove labels from the AST if they don't make sense
    // in a position. That makes it hard to keep track of if you're in a loop
    // with label. So we move the label onto the node itself, and handle it
    // manually (at least, if we're touching the loop, i.e. if it has an await
    // somewhere inside).
    enter(path) {
      if (containsAwait(path)) {
        path.node.body.loopLabel = path.node.label;
      }
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

    refactorLoop(path, false, this.addVarDecl, functionID => {
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

    refactorLoop(path, false, this.addVarDecl, functionID => {
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
      var KEYS = identifier(path.scope.generateUid('keys'));
      var OBJECT = identifier(path.scope.generateUid('object'));
      this.addVarDecl(KEYS);
      this.addVarDecl(OBJECT);
      path.replaceWithMultiple(forInEquiv({
        KEYS, OBJECT,
        KEY: identifier(path.scope.generateUid('key')),
        LEFT: path.node.left,
        RIGHT: path.node.right,
        BODY: path.node.body
      }));
    });
  }
};

const forInEquiv = template(`
  OBJECT = RIGHT;
  KEYS = [];
  for (var KEY in OBJECT) {
    KEYS.push(KEY);
  }
  KEYS.reverse();
  while(KEYS.length) {
    LEFT = KEYS.pop();
    if (LEFT in OBJECT) {
      BODY;
    }
  }
`);

function recursiveWrapFunction(functionID, body) {
  const func = wrapFunction(body);
  func.callee.id = functionID;

  return awaitStatement(func);
}

function insideAwaitContainingLabel(path) {
  // walks the path tree to check if inside a label that also contains an await
  // statement. (See also the LabeledStatement visitor.)
  do {
    if (path.node.loopLabel) {
      return true;
    }
  } while ((path = path.parentPath));

  // no such label found
  return false;
}

function ifShouldRefactorLoop(path, extraCheck, handler) {
  // ensureBlock here is convenient, but has nothing to do with the method name
  ensureBlock(path.node);

  if (extraCheck || insideAwaitContainingLabel(path) || loopContainsAwait(path.get('body'))) {
    handler();
  }
}

const NoSubLoopsVisitor = {
  Loop(path) {
    path.skip();
  }
};

// does the current loop (no subloops) contain an await statement?
const loopContainsAwait = matcher(
  ['AwaitExpression'],
  extend({}, NoSubFunctionsVisitor, NoSubLoopsVisitor)
);

function refactorLoop(path, extraCheck, addVarDecl, handler) {
  ifShouldRefactorLoop(path, extraCheck, () => {
    // gather info about the function & fix up its body (break + continue
    // statements)
    const label = path.node.loopLabel;
    const functionID = label || identifier(path.scope.generateUid('recursive'));
    const info = {functionID};
    path.get('body').traverse(BreakContinueReplacementVisitor, info);
    // actual conversion
    handler(functionID);

    // if containing a return *or* a break statement that doesn't control the
    // own loop (references a label of another loop), add:
    //
    // .then(function (_resp) {
    //   _temp = _resp;
    //   if (_temp !== _recursive) {
    //     return _temp;
    //   }
    // });
    if (info.addReturnHandler) {
      var tmp = identifier(path.scope.generateUid('temp'));
      addVarDecl(tmp);
      path.node.loopLabel = label;
      path.replaceWithMultiple(loopReturnHandler({TMP: tmp, BASE: path.node, FUNC: functionID}));
    }
  });
}

const loopReturnHandler = template(`
  TMP = BASE
  if (_temp !== FUNC) {
    return _temp;
  }
`);

const continueStatementEquiv = funcID => {
  // continue label; -> return await label();
  const stmt = returnStatement(awaitExpression(callExpression(funcID, [])))
  // not a 'real' return
  stmt.noHandlerRequired = true;
  return stmt;
};

const BreakContinueReplacementVisitor = extend({
  ReturnStatement(path) {
    if (!path.node.noHandlerRequired && path.node.argument) {
      // if a return statement added by the user - and actually returning
      // something, we need to add a return handler later.
      this.addReturnHandler = true;
    }
  },
  // replace continue/break with their recursive equivalents
  BreakStatement(path) {
    // a break statement is replaced by returning the name of the loop function
    // that should be broken. It's a convenient unique value.
    //
    // So: break; becomes return _recursive;
    //
    // and break myLabel; becomes return myLabel;

    const label = getLabel(path, this.functionID);

    const returnStmt = returnStatement(getLabel(path, this.functionID));
    if (label === this.functionID) {
      // only if this controls the current loop, a return handler is unnecessary
      returnStmt.noHandlerRequired = true;
    }
    path.replaceWith(returnStmt);
  },
  ContinueStatement(path) {
    // see break, with the difference that the function is called (and thus)
    // executed next
    path.replaceWith(continueStatementEquiv(getLabel(path, this.functionID)));
  }
}, NoSubFunctionsVisitor, NoSubLoopsVisitor);

const getLabel = (path, functionID) => path.node.label || functionID;
