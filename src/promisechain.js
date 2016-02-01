import {
  blockStatement,
  callExpression,
  functionExpression,
  identifier,
  isExpressionStatement,
  memberExpression,
  returnStatement
} from 'babel-types';
import {extend} from 'js-extend';
import {NoSubFunctionsVisitor} from './utils';

export default class PromiseChain {
  constructor(inner, dirtyAllowed, respName) {
    this._inner = inner;
    this._dirtyAllowed = dirtyAllowed;
    this._respID = identifier(respName);
    this._ast = callExpression(memberExpression(identifier('Promise'), identifier('resolve')), []);
    this._reset();
  }
  add(path) {
    var add = this.add.bind(this);
    const awaitInfos = [];
    path.traverse(PromisifyPrepVisitor, {awaitInfos, add, respID: this._respID});

    awaitInfos.forEach(awaitInfo => {
      this.nextLink.body.push(returnStatement(awaitInfo.arg));
      this.addNextLink();
      if (awaitInfo.passID) {
        this.nextLink.params = [this._respID];
      }
      this.nextLink.dirty = true;
    });
    if (path.node) {
      this.nextLink.body.push(path.node);
    }
  }
  addNextLink(force) {
    const dirtyNecessity = !this._dirtyAllowed && this.nextLink.dirty;
    if (force || dirtyNecessity || this.nextLink.body.length) {
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
      const info = {arg: path.node.argument};
      if (isExpressionStatement(path.parent)) {
        path.remove();
      } else {
        info.passID = true;
        path.replaceWith(this.respID);
      }
      this.awaitInfos.push(info);
    }
  }
}, NoSubFunctionsVisitor);
