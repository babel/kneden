import {
  assignmentExpression,
  awaitExpression,
  callExpression,
  expressionStatement,
  functionExpression
} from 'babel-types';
import {extend} from 'js-extend';

export const NoSubFunctionsVisitor = {
  Function(path) {
    path.skip();
  }
}

export const containsAwait = matcher(['AwaitExpression'], NoSubFunctionsVisitor);

export function matcher(types, base) {
  const MatchVisitor = extend({}, base);
  types.forEach(type => {
    MatchVisitor[type] = function (path) {
      this.match.found = true;
      path.stop();
    };
  });
  return function (path) {
    if (!path.node) {
      return false;
    }
    if (types.indexOf(path.node.type) !== -1) {
      return true;
    }
    const match = {}
    path.traverse(MatchVisitor, {match});
    return match.found;
  }
}

export function wrapFunction(body) {
  const func = functionExpression(null, [], body, false, true);
  func.dirtyAllowed = true;
  return callExpression(func, []);
}

export const awaitStatement = arg => expressionStatement(awaitExpression(arg));

export const assign = (a, b) =>
  expressionStatement(assignmentExpression('=', a, b));
