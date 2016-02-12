import hoistVariables from 'babel-helper-hoist-variables';

import {
  blockStatement,
  identifier,
  isBlockStatement,
  isCallExpression,
  isFunctionExpression,
  isReturnStatement,
  returnStatement,
  thisExpression,
  variableDeclaration,
  variableDeclarator
} from 'babel-types';

import {RefactorVisitor, IfRefactorVisitor} from './refactor';
import PromiseChain from './promisechain';

module.exports = () => ({
  visitor: WrapperVisitor,
  manipulateOptions(opts, parserOpts) {
    parserOpts.plugins.push('asyncFunctions');
  }
});

let depth = 0;
let respID, errID;

const WrapperVisitor = {
  // Because only ES5 is really supported, force this plugin to run as late as
  // possible. At least the normal (es2015 preset) transforms have happened by
  // then.
  Program: {
    exit(path) {
      respID = path.scope.generateUid('resp');
      errID = path.scope.generateUid('err');
      path.traverse(MainVisitor);
      // inline functions
      path.traverse(InliningVisitor);
    }
  }
};

const MainVisitor = {
  Function: {
    enter(path) {
      depth++;
      const {node} = path;
      if (node.async) {
        const decls = [];
        const addVarDecl = id => decls.push(variableDeclarator(id));
        // hoist variables
        hoistVariables(path, addVarDecl);

        // info gathering for this/arguments during the refactoring
        const thisID = identifier(path.scope.generateUid('this'));
        const argumentsID = identifier(path.scope.generateUid('arguments'));
        const used = {thisID: false, argumentsID: false};

        const newBody = [];
        const addFunctionDecl = func => newBody.push(func);

        // refactor code
        const args = {thisID, argumentsID, used, addVarDecl, addFunctionDecl, respID, errID};
        path.traverse(RefactorVisitor, args);
        // add this/arguments vars if necessary
        if (used.thisID) {
          decls.push(variableDeclarator(thisID, thisExpression()));
        }
        if (used.argumentsID) {
          decls.push(variableDeclarator(argumentsID, identifier('arguments')));
        }
        if (decls.length) {
          newBody.push(variableDeclaration('var', decls));
        }

        // transformations that can only be done after all others.
        path.traverse(IfRefactorVisitor);

        // build the promise chain
        const chain = new PromiseChain(depth > 1, node.dirtyAllowed, respID, errID);
        chain.add(path.get('body.body'));
        newBody.push(returnStatement(chain.toAST()));

        // combine all the newly generated stuff.
        node.body = blockStatement(newBody);
        node.async = false;
      }
    },
    exit() {
      depth--;
    }
  }
};

const InliningVisitor = {
  BlockStatement(path) {
    // inline blocks. Included because babel-template otherwise creates empty
    // blocks.
    if (isBlockStatement(path.parent)) {
      path.replaceWithMultiple(path.node.body);
    }
  },
  ReturnStatement(path) {
    // return function () { ...body... }() becomes: ...body...
    const call = path.node.argument;
    const inlineable = (
      isCallExpression(call) &&
      !call.arguments.length &&
      isFunctionExpression(call.callee) &&
      !call.callee.id &&
      !call.callee.params.length &&
      isBlockStatement(call.callee.body) &&
      !Object.keys(path.get('argument.callee').scope.bindings).length
    );
    if (inlineable) {
      path.replaceWithMultiple(call.callee.body.body);
    }
  },
  CallExpression(path) {
    // function () { return x; }() becomes x
    const inlineable = (
      !path.node.arguments.length &&
      isFunctionExpression(path.node.callee) &&
      !path.node.callee.id &&
      !path.node.callee.params.length &&
      isBlockStatement(path.node.callee.body) &&
      path.node.callee.body.body.length === 1 &&
      isReturnStatement(path.node.callee.body.body[0]) &&
      path.node.callee.body.body[0].argument
    );
    if (inlineable) {
      path.replaceWith(path.node.callee.body.body[0].argument);
    }
  }
};
