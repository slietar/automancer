import ast
import re
from enum import Enum
from typing import Optional

from .staticeval import EvaluationContext, EvaluationError, evaluate
from ..draft import DraftDiagnostic
from ..reader import LocatedString
from ..util.decorators import debug


expr_regexp = re.compile(r"([$@%])?{{((?:\\.|[^\\}]|}(?!}))*)}}")
escape_regexp = re.compile(r"\\(.)")

def unescape(value):
  # Complex replacement of escape_regexp.sub(r"\1", value))

  output = str()
  pos = 0

  for match in escape_regexp.finditer(value):
    span = match.span()
    group_span = match.span(1)

    output += value[pos:span[0]]
    output += value[group_span[0]:group_span[1]]

    pos = span[1]

  output += value[pos:]
  return output


class PythonSyntaxError(Exception):
  def __init__(self, message, target):
    self.message = message
    self.target = target

  def diagnostic(self):
    return DraftDiagnostic(self.message, ranges=self.target.area.ranges)


class PythonExprKind(Enum):
  Field = 0
  Static = 1
  Dynamic = 2
  Binding = 3


@debug
class PythonExpr:
  def __init__(self, contents, kind, tree):
    self.contents = contents
    self.kind = kind
    self.tree = tree

  @staticmethod
  def parse(raw_str):
    from .langservice import Analysis

    match = expr_regexp.search(raw_str)

    if not match:
      return None

    match match.group(1):
      case None:
        kind = PythonExprKind.Field
      case "$":
        kind = PythonExprKind.Static
      case "%":
        kind = PythonExprKind.Dynamic
      case "@":
        kind = PythonExprKind.Binding
      case _:
        raise ValueError()

    analysis = Analysis()
    contents = unescape(LocatedString.from_match_group(match, 2).strip())

    try:
      tree = ast.parse(contents, mode='eval')
    except SyntaxError as e:
      target = contents.index_syntax_error(e)
      analysis.errors.append(PythonSyntaxError(e.msg, target))

      return analysis, Ellipsis

    return analysis, PythonExpr(
      contents=contents,
      kind=kind,
      tree=tree
    )


class PythonExprEvaluator:
  def __init__(self, expr, /, type):
    self._expr = expr
    self._type = type

    self.envs: Optional[list] = None

  def evaluate(self, context):
    from .langservice import Analysis

    ctx = EvaluationContext()

    for env in self.envs:
      ctx.closure = {**ctx.closure, **context[env]}
    # print(">>>>>", context, self.envs)

    try:
      result = evaluate(self._expr.tree.body, self._expr.contents, ctx)
    except EvaluationError as e:
      return Analysis(errors=[e]), Ellipsis
    else:
      return self._type.analyze(result)


if __name__ == "__main__":
  from ..reader import Source
  # print(PythonExpr.parse(Source("${{ 1 + 2 }}")))
  print(PythonExpr.parse(Source(r"x{{ '\}}\\'xx' + 2 }}y")))
