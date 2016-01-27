// TODO: migrate to https://github.com/benjamn/recast ? Better preservation of
// whitespace etc. would be nice to have. Last try didn't work out though
// (async/await trouble).

var acorn = require('acorn');
require('acorn-es7-plugin')(acorn);

var estraverse = require('estraverse');
var escodegen = require('escodegen');

exports.parse = function (code) {
  var comments = [];
  var tokens = [];
  var ast = acorn.parse(code, {
    plugins: {asyncawait: true},
    ecmaVersion: 7,
    ranges: true,
    onComment: comments,
    onToken: tokens,
    sourceType: 'module'
  });
  escodegen.attachComments(ast, comments, tokens);

  return ast;
};

exports.isFunc = function (node) {
  return [
    'FunctionDeclaration',
    'FunctionExpression',
    'ArrowFunctionExpression'
  ].indexOf(node.type) !== -1;
};

exports.resolveBase = function () {
  // AST-ish for ``Promise.resolve()``
  var memberExpr = exports.memberExpression(
    exports.identifier('Promise'),
    exports.identifier('resolve')
  )
  return exports.callExpression(memberExpr, []);
};

exports.memberExpression = function (object, property) {
  return {
    type: 'MemberExpression',
    object: object,
    property: property
  };
}

exports.callExpression = function (callee, args) {
  return {
    type: 'CallExpression',
    callee: callee,
    arguments: args
  };
}

exports.identifier = function (name) {
  return {
    type: 'Identifier',
    name: name
  };
};

exports.chainCall = function (base, name, args) {
  // AST-ish for (base.then(function (argName) {argBody})) where:
  // - base is 'base'
  // - 'then' or 'catch' is specified by 'name'
  // - args is an array of [argName, argBody] arrays. It's an array so it can be
  //   used for the (...).then(function (resp) {}, function (err) {}) form.
  var argsAst = args.map(function (arg) {
    return exports.functionExpression(arg[0] ? [exports.identifier(arg[0])] : [], arg[1]);
  });
  return exports.callExpression({
    type: 'MemberExpression',
    object: base,
    property: exports.identifier(name)
  }, argsAst);
};

exports.functionExpression = function (params, body) {
  return {
    type: 'FunctionExpression',
    params: params,
    body: exports.blockStatement(body)
  };
}

exports.blockStatement = function (body) {
  return {
    type: 'BlockStatement',
    body: body
  };
};

exports.returnStatement = function (argument) {
  return {
    type: 'ReturnStatement',
    argument: argument || null
  };
};

exports.containsAwait = function (node) {
  // does node have a descendant that's an AwaitExpression?
  return exports.matches(node, function (subNode) {
    return subNode.type === 'AwaitExpression';
  });
};

exports.matches = function (node, check) {
  var found = false;
  estraverse.traverse(node, {
    enter: function (subNode) {
      if (check(subNode)) {
        found = true;
        this.break();
      }
      return exports.skipSubFuncs(subNode);
    }
  });
  return found;
}

exports.throwStatement = function (argument) {
  return {
    type: 'ThrowStatement',
    argument: argument
  };
};

exports.blockify = function (node) {
  if (node.type === 'ArrowFunctionExpression' && node.expression) {
    // make it a non-expression arrow function for later processing
    node.body = exports.blockStatement([exports.returnStatement(node.body)]);
    node.expression = false;
  }
  node.body = exports.replaceSkippingFuncs(node.body, function (subNode) {
    if (exports.isLoop(subNode) && subNode.body.type !== 'BlockStatement') {
      subNode.body = exports.blockStatement([subNode.body]);
      return subNode;
    }
    if (subNode.type === 'IfStatement') {
      if (subNode.consequent.type !== 'BlockStatement') {
        subNode.consequent = exports.blockStatement([subNode.consequent]);
      }
      if (subNode.alternate && subNode.alternate.type !== 'BlockStatement') {
        subNode.alternate = exports.blockStatement([subNode.alternate]);
      }
      return subNode;
    }
  });
  return node;
}

exports.isLoop = function (node) {
  return [
    'WhileStatement',
    'DoWhileStatement',
    'ForStatement',
    'ForInStatement'
  ].indexOf(node.type) !== -1;
}

exports.skipSubFuncs = function (node) {
  if (exports.isFunc(node)) {
    return estraverse.VisitorOption.Skip;
  }
}

exports.ifStatement = function (test, consequent, alternate) {
  return {
    type: 'IfStatement',
    test: test,
    consequent: consequent,
    alternate: alternate || null
  };
}

exports.variableDeclaration = function (name, value) {
  return {
    type: 'VariableDeclaration',
    kind: 'var',
    declarations: [
      {
        type: 'VariableDeclarator',
        id: exports.identifier(name),
        init: value
      }
    ]
  };
}

exports.assignmentExpression = function (left, right) {
  return {
    type: 'AssignmentExpression',
    operator: '=',
    left: left,
    right: right
  };
}

exports.andOp = function (left, right) {
  return {
    type: 'LogicalExpression',
    operator: '&&',
    left: left,
    right: right
  };
}

exports.expressionStatement = function (expr) {
  return {
    type: 'ExpressionStatement',
    expression: expr
  };
}

exports.awaitExpression = function (expr) {
  return {
    type: 'AwaitExpression',
    argument: expr
  };
}

exports.replaceSkippingFuncs = function (node, enter, leave) {
  return estraverse.replace(node, {
    enter: function (node, parent) {
      return enter(node, parent) || exports.skipSubFuncs(node);
    },
    leave: leave
  });
}

exports.arrayExpression = function (elements) {
  return {
    type: 'ArrayExpression',
    elements: elements
  };
}

exports.forInStatement = function (left, right, body) {
  return {
    type: 'ForInStatement',
    left: left,
    right: right,
    body: exports.blockStatement(body)
  }
}

exports.thisExpression = function () {
  return {
    type: 'ThisExpression'
  };
}

exports.generate = function (ast) {
  return escodegen.generate(ast, {
    format: {indent: {style: '  '}},
    comment: true
  }) + '\n';
};
