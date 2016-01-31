import hoistVariables from 'babel-helper-hoist-variables';

import {
  blockStatement,
  identifier,
  isBlockStatement,
  isCallExpression,
  isFunctionDeclaration,
  isFunctionExpression,
  returnStatement,
  thisExpression,
  variableDeclaration,
  variableDeclarator
} from 'babel-types';

import RefactorVisitor from './refactor';
import PromiseChain from './promisechain';

export default () => ({
  visitor: MainVisitor,
  manipulateOptions(opts, parserOpts) {
    parserOpts.plugins.push('asyncFunctions');
  }
});

let depth = 0;

const MainVisitor = {
  Function: {
    enter(path) {
      depth++;
      const {node} = path;
      if (node.async) {
        // hoist variables
        const vars = [];
        hoistVariables(path, id => vars.push(id));
        const newBody = [];
        if (vars.length) {
          const declarators = vars.map(id => variableDeclarator(id));
          newBody.push(variableDeclaration("var", declarators));
        }

        // info gathering for this/arguments during the refactoring
        const thisID = identifier(path.scope.generateUid('this'));
        const argumentsID = identifier(path.scope.generateUid('arguments'));
        const used = {thisID: false, argumentsID: false};

        // refactor code
        path.traverse(RefactorVisitor, {thisID, argumentsID, used});

        // add this/arguments vars if necessary
        const decls = [];
        if (used.thisID) {
          decls.push(variableDeclarator(thisID, thisExpression()));
        }
        if (used.argumentsID) {
          decls.push(variableDeclarator(argumentsID, identifier('arguments')));
        }
        if (decls.length) {
          newBody.push(variableDeclaration('var', decls));
        }

        // build the promise chain
        const chain = new PromiseChain(depth > 1, node.dirtyAllowed);
        path.get('body.body').forEach(subPath => {
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
    exit() {
      depth--;
    }
  },
  Program: {
    exit(path) {
      // inline functions
      path.traverse(PostProcessingVisitor);
    }
  }
};

const PostProcessingVisitor = {
  ReturnStatement(path) {
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
  }
};
