import {
  blockStatement,
  callExpression,
  functionExpression,
  identifier,
  isExpressionStatement,
  isTryStatement,
  memberExpression,
  returnStatement
} from 'babel-types';
import {extend} from 'js-extend';
import {containsAwait, NoSubFunctionsVisitor} from './utils';

export default class PromiseChain {
  constructor(inner, dirtyAllowed) {
    this._inner = inner;
    this._dirtyAllowed = dirtyAllowed;
    this._ast = callExpression(memberExpression(identifier('Promise'), identifier('resolve')), []);
    this._reset();
  }
  add(path) {
    var add = this.add.bind(this);
    const awaitInfos = [];
    path.traverse(PromisifyPrepVisitor, {awaitInfos, add, respId: this._respId});

    awaitInfos.forEach(awaitInfo => {
      this.nextLink.body.push(returnStatement(awaitInfo.arg));
      this.addNextLink();
      if (awaitInfo.id) {
        this.nextLink.params = [awaitInfo.id];
      }
      this.nextLink.dirty = true;
    });
    if (path.node) {
      this.nextLink.body.push(path.node);
    }
  }
  addNextLink() {
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
    this.addNextLink();
    if (this._inner && this._ast.callee.object.name === 'Promise') {
      // Promise.resolve() is the same as nothing. So return nothing (there's
      // no nice AST value that could stand in)
      return callExpression(functionExpression(null, [], blockStatement([])), []);
    }
    if (this._inner && this._ast.callee.object.callee.object.name === 'Promise') {
      // only one handler to the promise - because we're in an inner function
      // there's no reason to wrap the handler in promise code. Convenienly,
      // such a handler is inlineable later on.
      //
      // Summary:
      // ``Promise.resolve().then(function () {})``
      // becomes
      // ``function () {}()``
      return callExpression(this._ast.arguments[0], []);
    }
    return this._ast;
  }
}

const PromisifyPrepVisitor = extend({
  AwaitExpression: {
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
