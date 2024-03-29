import ast
import builtins
import functools
import re
import traceback
from abc import ABC, abstractmethod
from dataclasses import KW_ONLY, dataclass
from enum import Enum
from types import EllipsisType, NoneType
from typing import Any, Callable, Generic, Literal, TypeVar, cast, overload

from quantops import Quantity

from ..util.asyncio import try_all
from ..analysis import DiagnosticAnalysis
from ..error import Diagnostic, DiagnosticDocumentReference
from ..host import logger
from ..langservice import LanguageServiceAnalysis
from ..reader import (LocatedString, LocatedValue, LocationArea,
                      PossiblyLocatedValue)
from ..staticanalysis.context import StaticAnalysisContext
from ..staticanalysis.expr import (BaseExprDefFactory, BaseExprEval,
                                   ConstantExprEval, Dependency, EvaluationError,
                                   InvalidExpressionError)
from ..staticanalysis.expression import evaluate_eval_expr
from ..staticanalysis.support import prelude
from ..util.misc import Exportable, log_exception
from .eval import EvalContext, EvalEnvs, EvalOptions, EvalSymbol, EvalVariables

expr_regexp = re.compile(r"^([$@%])?{{((?:\\.|[^\\}]|}(?!}))*)}}$")
escape_regexp = re.compile(r"\\(.)")

def unescape(value: LocatedString) -> LocatedString:
  # Complex replacement of escape_regexp.sub(r"\1", value))

  output = str()
  pos = 0

  for match in escape_regexp.finditer(value):
    span = match.span()
    group_span = match.span(1)

    # The result of the addition is a LocatedString because the RHS is a LocatedString.
    output += value[pos:span[0]]
    output += value[group_span[0]:group_span[1]]

    pos = span[1]

  output += value[pos:]
  return cast(LocatedString, output)


def export_value(value: Any, /):
  if isinstance(value, LocatedValue):
    return export_value(value.value)

  match value:
    case builtins.bool():
      return {
        "type": "boolean",
        "value": value
      }
    case builtins.float() | builtins.int():
      return {
        "type": "number",
        "value": value
      }
    case builtins.str():
      return {
        "type": "string",
        "value": value
      }
    case EllipsisType():
      return {
        "type": "ellipsis"
      }
    case NoneType():
      return {
        "type": "none"
      }
    case Exportable():
      return value.export()
    case Quantity():
      return {
        "type": "quantity",
        "magnitude": value.magnitude
      }
    case _:
      return {
        "type": "unknown"
      }


class EvalError(Diagnostic):
  def __init__(self, area: LocationArea, /, message: str):
    super().__init__(f"Evaluation error: {message}", references=[DiagnosticDocumentReference.from_area(area)])

class PythonSyntaxError(Diagnostic):
  def __init__(self, message: str, target: LocatedValue, /):
    super().__init__(
      message,
      references=[DiagnosticDocumentReference.from_value(target)]
    )


# @deprecated
class PythonExprKind(Enum):
  Field = 0
  Static = 1
  Dynamic = 2
  Binding = 3


# @deprecated
class PythonExpr:
  def __init__(self, contents: LocatedString, kind: PythonExprKind, tree: ast.Expression):
    self.contents = contents
    self.kind = kind
    self.tree = tree

  @functools.cached_property
  def _compiled(self):
    return compile(self.tree, filename="<string>", mode="eval")

  def export(self):
    return {
      "type": "expression",
      "contents": self.contents.value
    }

  def __repr__(self):
    return f"{self.__class__.__name__}({repr(ast.unparse(self.tree))})"

  @classmethod
  def _parse_match(cls, match: re.Match):
    from ..input import LanguageServiceAnalysis

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
        raise ValueError

    analysis = LanguageServiceAnalysis()
    contents = unescape(LocatedString.from_match_group(match, 2).strip())

    try:
      tree = ast.parse(contents, mode='eval')
    except SyntaxError as e:
      target = contents.index_syntax_error(e)
      analysis.errors.append(PythonSyntaxError(e.msg, target))

      return analysis, Ellipsis

    return analysis, cls(
      contents=contents,
      kind=kind,
      tree=tree
    )


T = TypeVar('T', bound=PossiblyLocatedValue, covariant=True)

class Evaluable(Exportable, ABC, Generic[T]):
  dependencies: set[Dependency]

  @abstractmethod
  def evaluate(self, context: EvalContext) -> 'tuple[LanguageServiceAnalysis, Evaluable[T] | EllipsisType]':
    ...

  def evaluate_constant(self, context: EvalContext) -> 'tuple[LanguageServiceAnalysis, T | EllipsisType]':
    analysis, result = self.evaluate(context)

    match result:
      case EvaluableConstantValue(value):
        return analysis, value
      case _:
        return analysis, Ellipsis

  def evaluate_final(self, context: EvalContext) -> 'tuple[LanguageServiceAnalysis, T | EllipsisType]':
    analysis, result = self.evaluate(context)

    if isinstance(result, EllipsisType):
      return analysis, Ellipsis

    assert isinstance(result, EvaluableConstantValue)
    return analysis, result.inner_value

  async def evaluate_final_async(self, context: EvalContext):
    analysis = LanguageServiceAnalysis()
    raw_result = analysis.add(self.evaluate(context))

    if isinstance(raw_result, EllipsisType):
      return analysis, Ellipsis

    await try_all([dependency.init() for dependency in raw_result.dependencies])

    result = analysis.add(raw_result.evaluate_final(EvalContext(stack=None)))

    return analysis, result

  def evaluate_provisional(self, context: EvalContext) -> 'tuple[LanguageServiceAnalysis, Evaluable[T] | EllipsisType]':
    return self.evaluate(context) # type: ignore

  # @deprecated
  @overload
  def eval(self, context: EvalContext, *, final: Literal[False]) -> 'tuple[LanguageServiceAnalysis, Evaluable[T] | EllipsisType]':
    ...

  # @deprecated
  @overload
  def eval(self, context: EvalContext, *, final: Literal[True]) -> 'tuple[LanguageServiceAnalysis, T | EllipsisType]':
    ...

  # @overload
  # def eval(self, context: EvalContext, *, final: Optional[bool] = None) -> 'tuple[LanguageServiceAnalysis, Evaluable[T] | T | EllipsisType]':
  #   ...

  # @deprecated
  def eval(self, context: EvalContext, *, final: bool):
    return self.evaluate(context) # type: ignore

  def export(self):
    raise NotImplementedError

  def export_inner(self, export_inner_value: Callable[[Any], Any], /):
    from ..input import EvaluableChain
    from ..input.dynamic import ConstantDynamicValue, EvaluableDynamicValue

    match self:
      case EvaluableConstantValue(LocatedValue(ConstantDynamicValue(inner_value))) | EvaluableConstantValue(LocatedValue(inner_value)):
        return {
          "type": "constant",
          "innerValue": export_inner_value(inner_value)
        }
      case EvaluablePythonExpr(contents) | EvaluableChain(EvaluablePythonExpr(contents)) | EvaluableDynamicValue(EvaluablePythonExpr(contents)):
        return {
          "type": "expression",
          "contents": contents.value
        }
      case _:
        raise ValueError


@dataclass
class PythonExprObject:
  contents: LocatedString
  tree: ast.Expression
  _: KW_ONLY
  envs: EvalEnvs

  def analyze(self):
    from ..langservice import LanguageServiceAnalysis

    variables = dict[str, BaseExprDefFactory]()

    for env in self.envs:
      for name, value in env.values.items():
        variables[name] = value.ExprDefFactory

    try:
      analysis, result = evaluate_eval_expr(self.tree.body, ({}, variables), prelude, StaticAnalysisContext(
        input_value=self.contents
      ))
    except Exception:
      log_exception(logger)
      traceback.print_exc()
      return LanguageServiceAnalysis(errors=[Diagnostic("Static analysis failure")]), Ellipsis

    return analysis, EvaluablePythonExpr(self.contents, result.to_evaluated(), [env.symbol for env in self.envs])

  @classmethod
  def parse(cls, raw_str: LocatedString, /):
    match = expr_regexp.match(raw_str)

    if not match:
      return None

    kind_symbol = match.group(1)
    contents = unescape(LocatedString.from_match_group(match, 2).strip())

    analysis = DiagnosticAnalysis()

    try:
      tree = ast.parse(contents, mode='eval')
    except SyntaxError as e:
      target = contents.index_syntax_error(e)
      analysis.errors.append(PythonSyntaxError(e.msg, target))

      return analysis, Ellipsis

    return analysis, (contents, tree)

@dataclass
class EvaluablePythonExpr(Evaluable):
  contents: LocatedString
  expr: BaseExprEval
  symbols: list[EvalSymbol]

  def evaluate(self, context):
    if context.stack is None:
      watched = self.expr.to_watched()

      try:
        result = watched.evaluate(watched.dependencies)
      except EvaluationError as e:
        return DiagnosticAnalysis(errors=[EvalError(self.contents.area, f"{e} ({e.__class__.__name__})")]), Ellipsis
      else:
        return DiagnosticAnalysis(), EvaluableConstantValue(LocatedValue.new(result, area=self.contents.area, deep=True), symbolic=True)
    else:
      try:
        # Idea: check that the expression doesn't take to long to evaluate (e.g. not more than 100 ms) by running it in a separate thread and killing it if it takes too long
        result = self.expr.evaluate(context.stack)
      except EvaluationError as e:
        return DiagnosticAnalysis(errors=[EvalError(self.contents.area, f"{e} ({e.__class__.__name__})")]), Ellipsis
      except InvalidExpressionError:
        return DiagnosticAnalysis(errors=[Diagnostic("Invalid expression", references=[DiagnosticDocumentReference.from_area(self.contents.area)])]), Ellipsis
      else:
        if isinstance(result, ConstantExprEval):
          return DiagnosticAnalysis(), EvaluableConstantValue(LocatedValue.new(result.value, area=self.contents.area, deep=True), symbolic=True)

        return DiagnosticAnalysis(), EvaluablePythonExpr(self.contents, result, self.symbols)

  @property
  def dependencies(self):
    return self.expr.to_watched().dependencies

  def export(self):
    return {
      "type": "expression",
      "contents": self.contents.value
    }


S = TypeVar('S', bound=PossiblyLocatedValue)

@dataclass(frozen=True)
class EvaluableConstantValue(Evaluable[S], Generic[S]):
  inner_value: S
  symbolic: bool = False

  @property
  def dependencies(self):
    return set()

  def evaluate(self, context):
    return DiagnosticAnalysis(), self

  def export(self):
    return export_value(self.inner_value)

  # def unwrap(self):
  #   return self.inner_value

  def __repr__(self):
    return f"{self.__class__.__name__}({self.inner_value!r})"


__all__ = [
  'Evaluable',
  'EvaluableConstantValue',
  'EvaluablePythonExpr',
  'PythonExprObject'
]
