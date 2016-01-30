import hoistVariables from 'babel-helper-hoist-variables';
import {extend} from 'js-extend';

import {
  blockStatement,
  callExpression,
  functionExpression,
  identifier,
  isBlockStatement,
  isExpressionStatement,
  isFunctionDeclaration,
  isReturnStatement,
  memberExpression,
  returnStatement,
  variableDeclaration,
  variableDeclarator
} from 'babel-types';

import {RefactorVisitor} from './refactor';
import {PostProcessingVisitor} from './inlining';
import {NoSubFunctionsVisitor} from './utils';

class PromiseChain {
  constructor(inner, dirtyAllowed) {
    this._inner = inner;
    this._dirtyAllowed = dirtyAllowed;
    this._ast = callExpression(memberExpression(identifier('Promise'), identifier('resolve')), []);
    this._reset();
  }
  add(subPath) {
    var add = this.add.bind(this);
    if (isBlockStatement(subPath.node)) {
      return subPath.get('block').forEach(add);
    }
    const awaitInfos = [];
    subPath.traverse(PromisifyPrepVisitor, {awaitInfos, add, respId: this._respId});

    awaitInfos.forEach(awaitInfo => {
      if (awaitInfo.arg) {
        this.nextLink.body.push(returnStatement(awaitInfo.arg));
        this._addNextLink();
        if (awaitInfo.id) {
          this.nextLink.params = [awaitInfo.id];
        }
        this.nextLink.dirty = true;
      }
    });
    if (subPath.node) {
      this.nextLink.body.push(subPath.node);
    }
  }
  _addNextLink() {
    const dirtyNecessity = !this._dirtyAllowed && this.nextLink.dirty;
    if (dirtyNecessity || this.nextLink.body.length) {
      const handlerBody = blockStatement(this.nextLink.body);
      const handler = functionExpression(null, this.nextLink.params, handlerBody);
      const method = memberExpression(this._ast, identifier(this.nextLink.type));
      this._ast = callExpression(method, [handler]);
      this._reset();
    }
  }
  _reset() {
    this.nextLink = {
      type: 'then',
      body: [],
      params: []
    }
  }
  toAST() {
    this._addNextLink();
    if (this._inner && this._ast.callee.object.name === 'Promise') {
      // just an empty promise. Because we're in an inner function, that's a
      // waste of code.
      return null;
    }
    if (this._inner && this._ast.callee.object.callee.object.name === 'Promise') {
      // only one handler to the promise - because we're in an inner function
      // there's no reason to wrap the handler in promise code. Convenienly,
      // such a handler is inlineable later on.
      return callExpression(this._ast.arguments[0], []);
    }
    return this._ast;
  }
}

const PromisifyPrepVisitor = extend({
  AwaitExpression: {
    enter(path) {
      if (isReturnStatement(path.parent)) {
        path.replaceWith(path.node.argument);
      }
    },
    exit(path) {
      // exit so awaits are evaluated inside out if there are multiple in
      // the expression
      const info = {
        arg: path.node.argument
      };
      if (isExpressionStatement(path.parent)) {
        path.remove();
      } else {
        info.id = identifier(path.scope.generateUid('resp'));
        path.replaceWith(info.id);
      }
      this.awaitInfos.push(info);
    }
  }
}, NoSubFunctionsVisitor);

let depth = 0;

const MainVisitor = {
  Function: {
    enter(path) {
      depth++;
      const {node} = path;
      if (node.async) {
        const newBody = [];
        path.traverse(RefactorVisitor);

        const vars = [];
        hoistVariables(path, id => vars.push(id));
        if (vars.length) {
          const declarators = vars.map(id => variableDeclarator(id));
          newBody.push(variableDeclaration("var", declarators));
        }

        const chain = new PromiseChain(depth > 1, node.dirtyAllowed);
        path.get('body.body').forEach(subPath => {
          if (isFunctionDeclaration(subPath.node)) {
            newBody.push(subPath.node);
          } else {
            chain.add(subPath);
          }
        });
        newBody.push(returnStatement(chain.toAST()));

        node.body = blockStatement(newBody);
        node.async = false;
      }
    },
    exit(path) {
      path.traverse(PostProcessingVisitor);
      depth--;
    }
  }
};

export default () => ({
  visitor: MainVisitor,
  manipulateOptions(opts, parserOpts) {
    parserOpts.plugins.push('asyncFunctions');
  }
});
