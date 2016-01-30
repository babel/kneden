import {
  isCallExpression,
  isFunctionExpression,
  isBlockStatement
} from 'babel-types';

export const PostProcessingVisitor = {
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
