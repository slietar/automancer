from typing import Any, Optional, Protocol

from ..draft import DraftDiagnostic
from ..reader import LocatedString, LocationArea


class EvalEnv(Protocol):
  pass

EvalVariables = dict[str, Any]
EvalStack = dict[EvalEnv, EvalVariables]

class EvalContext:
  def __init__(self, variables: Optional[EvalVariables] = None, /):
    self.variables = variables or dict()

class EvalError(Exception):
  def __init__(self, area: LocationArea, /):
    self.area = area

  def diagnostic(self):
    assert self.__cause__

    return DraftDiagnostic(str(self.__cause__), ranges=self.area.ranges)


def evaluate(compiled: Any, /, contents: LocatedString, context: EvalContext):
  try:
    return LocatedString(eval(compiled, globals(), context.variables), area=contents.area)
  except Exception as e:
    raise EvalError(contents.area) from e
