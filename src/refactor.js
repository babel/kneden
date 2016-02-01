// TODO: move everything related to 'if' to a separate file, just like the loops

import {
  assignmentExpression,
  awaitExpression,
  binaryExpression,
  blockStatement,
  booleanLiteral,
  ensureBlock,
  expressionStatement,
  identifier,
  ifStatement,
  isIfStatement,
  isReturnStatement,
  logicalExpression,
  returnStatement,
  unaryExpression
} from 'babel-types';
import {extend} from 'js-extend';

import PromiseChain from './promisechain';
import {
  awaitStatement,
  containsAwait,
  matcher,
  NoSubFunctionsVisitor,
  wrapFunction
} from './utils';
import PartialLoopRefactorVisitor from './looprefactor';

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
      const subChain = new PromiseChain(true, true, this.respID);
      path.get('block.body').forEach(subPath => subChain.add(subPath));
      if (path.node.handler) {
        subChain.addNextLink(true);
        // add a catch part, which contains its own catchChain (but that one might
        // be optimized away later on)
        subChain.nextLink.type = 'catch';
        const catchChain = new PromiseChain(true, true, this.respID);
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
  ThisExpression(path) {
    path.replaceWith(this.thisID);
    this.used.thisID = true;
  },
  Identifier(path) {
    if (path.node.name === 'arguments' && !path.scope.hasOwnBinding('arguments')) {
      path.replaceWith(this.argumentsID);
      this.used.argumentsID = true;
    }
  },
  SwitchStatement(path) {
    // converts a switch statement in a bunch of if statements that compare the
    // discriminant to each test. Falling through is handled by a 'match'
    // variable, and the break statement is handled by a variable 'brokenOut'.
    // Cases after the default case are repeated so the default case can fall
    // through (but in such a way that they won't match again if the default
    // isn't falling through)

    const discrID = identifier(path.scope.generateUid('discriminant'));
    const matchID = identifier(path.scope.generateUid('match'));
    const brokenID = identifier(path.scope.generateUid('brokenOut'));
    this.addVarDecl(discrID);
    this.addVarDecl(matchID);
    this.addVarDecl(brokenID);

    // replace break statements with assignment expressions
    path.traverse(SwitchBreakReplacementVisitor, {brokenID});

    const stmts = [];
    const notBroken = unaryExpression('!', brokenID);
    let defaultIdx;
    path.node.cases.forEach((caseNode, i) => {
      // add normal checks
      if (!caseNode.test) {
        defaultIdx = i;
        return;
      }

      const isOwnMatch = binaryExpression('===', discrID, caseNode.test);
      const isMatch = logicalExpression('||', matchID, isOwnMatch);
      const test = logicalExpression('&&', notBroken, isMatch);
      const matchAssign = assignmentExpression('=', matchID, booleanLiteral(true));
      stmts.push(ifStatement(test, blockStatement(caseNode.consequent.concat([
        expressionStatement(matchAssign)
      ]))));
    });

    if (typeof defaultIdx !== 'undefined') {
      // add default case
      const notMatch = unaryExpression('!', matchID);
      const defaultTest = logicalExpression('&&', notBroken, notMatch);
      const body = path.node.cases[defaultIdx].consequent;
      path.node.cases.slice(defaultIdx + 1).forEach(caseNode => {
        // add fall through cases after default - still guarded by the default
        // check
        body.push(ifStatement(notBroken, blockStatement(caseNode.consequent)));
      });
      stmts.push(ifStatement(defaultTest, blockStatement(body)));
    }

    path.replaceWithMultiple([
      expressionStatement(assignmentExpression('=', discrID, path.node.discriminant)),
      expressionStatement(assignmentExpression('=', matchID, booleanLiteral(false))),
      expressionStatement(assignmentExpression('=', brokenID, booleanLiteral(false)))
    ].concat(stmts));
  }
}, NoSubFunctionsVisitor);

const SwitchBreakReplacementVisitor = extend({
  BreakStatement(path) {
    // TODO: don't execute any code after the break assignment
    const assignment = assignmentExpression('=', this.brokenID, booleanLiteral(true));
    path.replaceWith(expressionStatement(assignment));
  }
  // TODO: don't touch sub switch statements. Enabling the following should be a
  // start.
  //SwitchStatement(path) {
  //  path.skip();
  //}
}, NoSubFunctionsVisitor);

const wrapIfBranch =
  branch => blockStatement([returnStatement(wrapFunction(branch))]);

const containsReturnOrAwait = matcher(['ReturnStatement', 'AwaitExpression']);

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
}, PartialLoopRefactorVisitor, NoSubFunctionsVisitor)
