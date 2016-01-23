var acorn = require('acorn');
require('acorn-es7-plugin')(acorn);

var astHoist = require('ast-hoist');
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
    onToken: tokens
  });
  escodegen.attachComments(ast, comments, tokens);

  return ast;
};

exports.hoist = function (ast) {
  ast = astHoist(ast, true);
  ast = estraverse.replace(ast, {
    // FIXME: fix upstream in hoist?
    enter: function (node) {
      if (node.type === 'SequenceExpression' && !node.expressions.length) {
        this.remove();
      }
    },
    leave: function (node) {
      if (node.type === 'ExpressionStatement' && !node.expression) {
        this.remove();
      }
    }
  });
  return ast;
};

exports.isFunc = function (node) {
  return [
    'FunctionDeclaration',
    'FunctionExpression'
  ].indexOf(node.type) !== -1;
};

exports.resolveBase = function () {
  return {
    type: 'CallExpression',
    callee: {
      type: 'MemberExpression',
      object: exports.identifier('Promise'),
      property: exports.identifier('resolve')
    },
    arguments: []
  };
};

exports.identifier = function (name) {
  return {
    type: 'Identifier',
    name: name
  };
};

exports.chainCall = function (base, name, args) {
  var argsAst = args.map(function (arg) {
    return functionExpression(arg[0] ? [exports.identifier(arg[0])] : [], arg[1]);
  });
  return {
    type: 'CallExpression',
    callee: {
      type: 'MemberExpression',
      object: base,
      property: exports.identifier(name)
    },
    arguments: argsAst
  };
};

function functionExpression(params, body) {
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
    argument: argument
  };
};

exports.containsAwait = function (node) {
  var found = false;
  estraverse.traverse(node, {
    enter: function (subNode) {
      if (subNode.type === 'AwaitExpression') {
        found = true;
        this.break();
      }
    }
  });
  return found;
};

exports.throwStatement = function (argument) {
  return {
    type: 'ThrowStatement',
    argument: argument
  };
};

exports.generate = function (ast) {
  return escodegen.generate(ast, {
    format: {indent: {style: '  '}},
    comment: true
  }) + '\n';
};
