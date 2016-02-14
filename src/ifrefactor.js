import {
  awaitExpression,
  blockStatement,
  ensureBlock,
  identifier,
  ifStatement,
  isIfStatement,
  isReturnStatement,
  logicalExpression,
  returnStatement,
  unaryExpression
} from 'babel-types';

import {
  assign,
  containsAwait,
  matcher,
  NoSubFunctionsVisitor,
  wrapFunction
} from './utils';

import {extend} from 'js-extend';

export const FirstPassIfVisitor = {
  IfStatement(path) {
    const {node} = path;
    ensureBlock(node, 'consequent');
    if (node.alternate) {
      ensureBlock(node, 'alternate');
    }
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
      // the BlockStatement handler in the other IfRefactorVisitor below.

      const testID = identifier(path.scope.generateUid('test'));
      this.addVarDecl(testID);
      const block = [assign(testID, node.test)];

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
  }
};

const containsReturnOrAwait = matcher(['ReturnStatement', 'AwaitExpression'], NoSubFunctionsVisitor);

export const SecondPassIfVisitor = extend({
  IfStatement(path) {
    const alt = path.node.alternate;
    if (!path.node.consequent.body.length && alt && alt.body.length) {
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
  },
  BlockStatement(path) {
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
}, NoSubFunctionsVisitor)

const wrapIfBranch =
  branch => blockStatement([returnStatement(wrapFunction(branch))]);

function extendElse(ifStmt, extraBody) {
  const body = ((ifStmt.alternate || {}).body || []).concat(extraBody);
  if (body.length) {
    ifStmt.alternate = blockStatement(body);
  }
}
