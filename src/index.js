import hoistVariables from 'babel-helper-hoist-variables';

import {
  blockStatement,
  ensureBlock,
  identifier,
  isBlockStatement,
  isCallExpression,
  isFunctionDeclaration,
  isFunctionExpression,
  isReturnStatement,
  returnStatement,
  thisExpression,
  variableDeclaration,
  variableDeclarator
} from 'babel-types';

import {RefactorVisitor, IfRefactorVisitor} from './refactor';
import PromiseChain from './promisechain';

export default () => ({
  visitor: MainVisitor,
  manipulateOptions(opts, parserOpts) {
    parserOpts.plugins.push('asyncFunctions');
  }
});

let depth = 0;
let respIDs = [];

const MainVisitor = {
  Function: {
    enter(path) {
      ensureBlock(path.node);
      depth++;
      const {node} = path;
      if (node.async) {
        const decls = [];
        const addVarDecl = id => decls.push(variableDeclarator(id));
        hoistVariables(path, addVarDecl);

        // info gathering for this/arguments during the refactoring
        const thisID = identifier(path.scope.generateUid('this'));
        const argumentsID = identifier(path.scope.generateUid('arguments'));
        const used = {thisID: false, argumentsID: false};

        // determine a suitable value for the '_resp' variable
        if (path.scope.hasOwnBinding(respIDs[respIDs.length - 1])) {
          respIDs.push(path.scope.generateUid('resp'));
        }
        const respID = respIDs[respIDs.length - 1];
        // refactor code
        path.traverse(RefactorVisitor, {thisID, argumentsID, used, addVarDecl, respID});
        // hoist variables
        const newBody = [];
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
        const chain = new PromiseChain(depth > 1, node.dirtyAllowed, respID);
        path.get('body.body').forEach(subPath => {``
          // TODO: this currenly doesn't happen for try/catch subchains. It
          // should. Fix it, preferably by just making function hoisting an
          // earlier step and removing the logic here. Promise chains are
          // complicated enough on their own.
          if (isFunctionDeclaration(subPath.node)) {
            newBody.push(subPath.node);
          } else {
            chain.add(subPath);
          }
        });
        newBody.push(returnStatement(chain.toAST()));

        // combine all the newly generated stuff.
        node.body = blockStatement(newBody);
        node.async = false;
      }
    },
    exit(path) {
      if (path.scope.hasOwnBinding(respIDs[respIDs.length - 2])) {
        respIDs.pop();
      }
      depth--;
    }
  },
  Program: {
    enter(path) {
      respIDs.push(path.scope.generateUid('resp'));
    },
    exit(path) {
      // inline functions
      path.traverse(InliningVisitor);
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
