import {
  arrayExpression,
  awaitExpression,
  binaryExpression,
  blockStatement,
  booleanLiteral,
  callExpression,
  expressionStatement,
  identifier,
  ifStatement,
  isExpressionStatement,
  isReturnStatement,
  logicalExpression,
  memberExpression,
  numericLiteral,
  objectExpression,
  returnStatement,
  unaryExpression
} from 'babel-types';
import {extend} from 'js-extend';

import PromiseChain from './promisechain';
import {
  assign,
  awaitStatement,
  containsAwait,
  NoSubFunctionsVisitor,
  wrapFunction
} from './utils';
import {FirstPassIfVisitor, SecondPassIfVisitor} from './ifrefactor';
import PartialLoopRefactorVisitor from './looprefactor';

export const IfRefactorVisitor = SecondPassIfVisitor;

export const RefactorVisitor = extend({
  AwaitExpression(path) {
    // ``return await x`` becomes just ``return x``
    if (isReturnStatement(path.parent)) {
      path.replaceWith(path.node.argument);
    }
  },
  BinaryExpression(path) {
    // a() + await b
    //
    // ->
    //
    // _temp = a(), _temp + await b
    //
    // to make sure the execution order is correct. This provides a nice trick:
    // if you don't care about evaluation order and have one await-ed item in
    // your binary expression, put it on the left side of the operator.

    if (containsAwait(path.get('right')) && !path.node.left.isTemp) {
      const tmp = identifier(path.scope.generateUid('temp'));
      tmp.isTemp = true;
      this.addVarDecl(tmp);
      const assignment = assign(tmp, path.node.left);
      path.node.left = tmp;
      insertBefore(path, assignment);
    }
  },
  ArrayExpression(path) {
    // [a(), await b()]
    //
    // ->
    //
    // await Promise.all([
    //   function () {return a();}(),
    //   function () {return await b();}()
    // ])
    //
    // (which is optimized away to:)
    //
    // await Promise.all([a(), b()])

    if (path.get('elements').slice(1).some(containsAwait)) {
      const elements = path.node.elements.map(element => {
        return wrapFunction(blockStatement([returnStatement(element)]));
      });
      const promiseAll = memberExpression(identifier('Promise'), identifier('all'));
      path.replaceWith(awaitExpression(callExpression(promiseAll, [arrayExpression(elements)])));
    }
  },
  CallExpression(path) {
    // call(a(), await b())
    //
    // ->
    //
    // _temp = [a(), await b()], call(_temp[0], _temp[1])

    if (path.get('arguments').slice(1).some(containsAwait)) {
      const tmp = identifier(path.scope.generateUid('temp'));
      this.addVarDecl(tmp);
      const assignment = assign(tmp, arrayExpression(path.node.arguments));
      path.node.arguments = path.node.arguments.map((_, i) => {
        return memberExpression(tmp, numericLiteral(i), true);
      })
      insertBefore(path, assignment);
    }
  },
  ObjectExpression(path) {
    // {a: a(), b: await b()}
    //
    // ->
    //
    // _temp = {}, _temp.a = a(), _temp.b = await b(), _temp

    if (path.get('properties').slice(1).some(containsAwait)) {
      const tmp = identifier(path.scope.generateUid('temp'));
      this.addVarDecl(tmp);
      const assignments = [assign(tmp, objectExpression([]))];
      path.node.properties.forEach(property => {
        const member = memberExpression(tmp, property.key);
        assignments.push(assign(member, property.value));
      });
      path.replaceWith(tmp);
      insertBefore(path, assignments);
    }
  },
  TryStatement: {
    exit(path) {
      // changes a try/catch that contains an await in a promise chain that uses
      // .catch()
      //
      // uses exit() to make sure nested try/catch-es are converted correctly
      // too.

      if (containsAwait(path)) {
        const subChain = new PromiseChain(true, true, this.respID, this.errID);
        subChain.add(path.get('block.body'));
        if(path.node.handler) {
          subChain.addCatch(path.get('handler.body.body'), path.node.handler.param);
        }
        if (path.node.finalizer) {
          subChain.addFinally(path.get('finalizer.body'));
        }
        path.replaceWith(awaitStatement(subChain.toAST()));
      }
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

      // Seems like a weird order? Maybe, but it does prevent the
      // BinaryExpression refactorer to make too much of a mess for the sake of
      // strict execution order correctness.
      const isOwnMatch = binaryExpression('===', caseNode.test, discrID);
      const isMatch = logicalExpression('||', matchID, isOwnMatch);
      const test = logicalExpression('&&', notBroken, isMatch);
      stmts.push(ifStatement(test, blockStatement(caseNode.consequent.concat([
        assign(matchID, booleanLiteral(true))
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
      assign(discrID, path.node.discriminant),
      assign(matchID, booleanLiteral(false)),
      assign(brokenID, booleanLiteral(false))
    ].concat(stmts));
  },
  FunctionDeclaration(path) {
    this.addFunctionDecl(path.node);
    path.remove();
  },
  FunctionExpression(path) {
    if (path.node.id && path.parent.type !== 'ObjectProperty') {
      path.node.type = 'FunctionDeclaration';
      this.addFunctionDecl(path.node)
      path.replaceWith(path.node.id);
    }
  }
}, FirstPassIfVisitor, PartialLoopRefactorVisitor, NoSubFunctionsVisitor);

function insertBefore(path, node) {
  // prevent unnecessary sequence expressions. In normal JS they might be
  // elegant and thus nice for Babel, but their async wrapper is ugly.
  if (isExpressionStatement(path.parent) || isReturnStatement(path.parent)) {
    path.parentPath.insertBefore(node);
  } else {
    path.insertBefore(node);
  }
}

const SwitchBreakReplacementVisitor = extend({
  BreakStatement(path) {
    // TODO: don't execute any code after the break assignment
    path.replaceWith(assign(this.brokenID, booleanLiteral(true)));
  }
  // TODO: don't touch sub switch statements. Enabling the following should be a
  // start.
  //SwitchStatement(path) {
  //  path.skip();
  //}
}, NoSubFunctionsVisitor);

const wrapAwaitContaining =
  node => wrapFunction(blockStatement([returnStatement(node)]));
