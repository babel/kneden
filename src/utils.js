import {
  awaitExpression,
  expressionStatement
} from 'babel-types';
import {extend} from 'js-extend';

export const NoSubFunctionsVisitor = {
  Function(path) {
    path.skip();
  }
}

export const awaitStatement = arg => expressionStatement(awaitExpression(arg));

export function containsAwait(path) {
  const match = {};
  path.traverse(MatchAwaitVisitor, {match});
  return match.found;
}

const MatchAwaitVisitor = extend({
  AwaitExpression(path) {
    this.match.found = true;
    path.stop();
  }
}, NoSubFunctionsVisitor);
