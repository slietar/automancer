import ast
from asyncio import Event
from dataclasses import dataclass
from types import EllipsisType
from typing import Any, Callable, Literal, Optional, TypeAlias, TypedDict, cast

import automancer as am
from pr1.error import Diagnostic, DiagnosticDocumentReference
from pr1.fiber.eval import EvalContext, EvalEnv, EvalEnvValue, EvalStack
from pr1.fiber.expr import Evaluable, EvaluableConstantValue
from pr1.input import (
                                   AnyType, Attribute, KVDictType,
                                   PotentialExprType, PrimitiveType, StrType)
from pr1.fiber.master2 import ProgramHandle, ProgramOwner
from pr1.fiber.parser import (AnalysisContext, Attrs, BaseBlock,
                              BaseLeadTransformer, BaseParser,
                              BasePassiveTransformer, BaseProgramLocation, BaseProgramPoint,
                              BlockData, BaseProgram, FiberParser, Layer,
                              LeadTransformerPreparationResult,
                              PassiveTransformerPreparationResult,
                              ProtocolUnitData, TransformerAdoptionResult)
from pr1.fiber.process import ProgramExecEvent
from pr1.master.analysis import MasterAnalysis
from pr1.reader import (LocatedString, LocatedValue, LocationArea,
                        ReliableLocatedDict)
from pr1.util.decorators import debug

from . import namespace


class CircularReferenceError(Diagnostic):
  def __init__(self, target: LocatedValue):
    super().__init__("Invalid circular reference", references=[DiagnosticDocumentReference.from_value(target)])


@dataclass(kw_only=True)
class ShorthandStaticItem:
  create_layer: Callable[[], tuple[am.LanguageServiceAnalysis, am.Layer | EllipsisType]]
  definition_body_ref: DiagnosticDocumentReference
  definition_full_ref: DiagnosticDocumentReference
  definition_name_ref: DiagnosticDocumentReference
  deprecated: bool
  description: Optional[str]
  layer: Optional[am.Layer | EllipsisType] = None
  preparing: bool = False
  priority: int = 0
  references: list[am.DiagnosticDocumentReference]
  symbol: am.EvalSymbol

@dataclass(kw_only=True)
class ShorthandDynamicItem:
  argument: Evaluable[LocatedValue]
  data: BlockData
  name: str


@dataclass(frozen=True, slots=True)
class ArgExprDef(am.BaseExprDef):
  node: ast.expr
  symbol: am.EvalSymbol

  @property
  def type(self):
    return am.UnknownDef()

  def to_evaluated(self):
    return ArgEvalExprEval((), self.symbol)

ArgPathItem: TypeAlias = tuple[Literal[False], str] | tuple[Literal[True], int | str]
ArgPath: TypeAlias = tuple[ArgPathItem, ...]

def apply_path(obj: Any, /, path: ArgPath):
  current_obj = obj

  for indexed, key in path:
    current_obj = current_obj[key] if indexed else getattr(current_obj, cast(str, key))

  return current_obj

@dataclass(frozen=True, slots=True)
class ArgEvalExprEval(am.BaseExprEval):
  path: ArgPath # boolean = indexed
  symbol: am.EvalSymbol

  def evaluate(self, stack):
    if self.symbol in stack:
      entries: dict[ArgPath, Any] = stack[self.symbol]

      for entry_path, entry_value in entries.items():
        if entry_path[0:len(self.path)] == self.path:
          # TODO: Check for errors
          return am.ConstantExprEval(apply_path(entry_value, entry_path[len(self.path):]))




class Attributes(TypedDict, total=False):
  shorthands: ReliableLocatedDict[LocatedString, ReliableLocatedDict[LocatedString, Any]]

class LeadTransformer(BaseLeadTransformer):
  def __init__(self, parser: 'Parser'):
    super().__init__()
    self.parser = parser

  def prepare(self, data: Attrs, /, envs):
    analysis = am.LanguageServiceAnalysis()
    calls = list[LeadTransformerPreparationResult[tuple[ShorthandStaticItem, LocationArea, Any]]]()

    context = AnalysisContext(envs=envs)

    for shorthand_name, arg in data.items():
      shorthand = self.parser.shorthands[shorthand_name]
      assert shorthand.layer

      if (not isinstance(shorthand.layer, EllipsisType)) and shorthand.layer.lead_transform:
        arg_result = analysis.add(PotentialExprType(AnyType()).analyze(arg, context.update(auto_expr=True)))

        if not isinstance(arg_result, EllipsisType):
          call_area = cast(LocatedString, shorthand_name).area
          calls.append(LeadTransformerPreparationResult((shorthand, call_area, arg_result), origin_area=call_area))

    return analysis, calls

  def adopt(self, data: tuple[ShorthandStaticItem, LocationArea, am.Evaluable], /, adoption_stack, trace):
    analysis = am.LanguageServiceAnalysis()
    shorthand, call_area, arg = data

    assert shorthand.layer
    assert not isinstance(shorthand.layer, EllipsisType)

    arg_result = analysis.add(arg.evaluate_provisional(am.EvalContext(adoption_stack)))

    if isinstance(arg_result, EllipsisType):
      return analysis, Ellipsis

    block = analysis.add(shorthand.layer.adopt_lead(adoption_stack | {
      shorthand.symbol: {
        (): arg_result.inner_value.value
      } if isinstance(arg_result, am.EvaluableConstantValue) else {}
    }, [*trace, DiagnosticDocumentReference.from_area(call_area)]))

    if isinstance(block, EllipsisType):
      return analysis, Ellipsis

    return analysis, ShorthandBlock(arg_result, block, shorthand.symbol)

class PassiveTransformer(BasePassiveTransformer):
  def __init__(self, parser: 'Parser'):
    super().__init__(priority=300)
    self.parser = parser

  def prepare(self, data: Attrs, /, envs):
    analysis = am.LanguageServiceAnalysis()
    calls = list[tuple[ShorthandStaticItem, LocationArea, Evaluable]]()

    context = AnalysisContext(envs=envs)

    for shorthand_name, arg in data.items():
      shorthand = self.parser.shorthands[shorthand_name]
      assert shorthand.layer

      if (not isinstance(shorthand.layer, EllipsisType)) and (not shorthand.layer.lead_transform):
        arg_result = analysis.add(PotentialExprType(AnyType()).analyze(arg, context))

        if not isinstance(arg_result, EllipsisType):
          calls.append((shorthand, cast(LocatedString, shorthand_name).area, arg_result))

    calls = sorted(calls, key=(lambda call: -call[0].priority))

    return analysis, (PassiveTransformerPreparationResult(calls) if calls else None)

  def adopt(self, data: list[tuple[ShorthandStaticItem, LocationArea, Evaluable[LocatedValue[Any]]]], /, adoption_stack, trace):
    analysis = am.LanguageServiceAnalysis()
    calls = list[tuple[ShorthandStaticItem, Any]]()

    for shorthand, call_area, arg in data:
      assert isinstance(shorthand.layer, Layer)

      arg_result = analysis.add(arg.eval(EvalContext(adoption_stack), final=True))

      if isinstance(arg_result, EllipsisType):
        continue

      adopted_transforms, _ = analysis.add(shorthand.layer.adopt(adoption_stack | {
        shorthand.env: {
          'arg': arg_result.value().value
        }
      }, [*trace, DiagnosticDocumentReference.from_area(call_area)]))

      calls.append((shorthand, adopted_transforms))

    return analysis, TransformerAdoptionResult(calls)

  def execute(self, data: list[tuple[ShorthandStaticItem, Any]], /, block):
    analysis = am.LanguageServiceAnalysis()
    current_block = block

    for shorthand, adopted_transforms in data[::-1]:
      assert isinstance(shorthand.layer, Layer)
      current_block = analysis.add(shorthand.layer.execute(adopted_transforms, current_block))

    return analysis, current_block


class Parser(am.BaseParser):
  namespace = namespace

  root_attributes = {
    'shorthands': Attribute(
      description="Defines shorthands, parts of steps that can be reused.",
      type=KVDictType(StrType(), PrimitiveType(dict))
    )
  }

  def __init__(self, fiber: FiberParser):
    super().__init__(fiber)

    self.fiber = fiber
    self.shorthands = dict[str, ShorthandStaticItem]()
    self.transformers = [
      LeadTransformer(self),
      PassiveTransformer(self)
    ]

  @property
  def layer_attributes(self):
    return {
      shorthand_name: Attribute(
        deprecated=shorthand.deprecated,
        description=shorthand.description,
        optional=True,
        type=AnyType()
      ) for shorthand_name, shorthand in self.shorthands.items()
    }

  def preload(self, raw_attrs: Attrs, /):
    analysis = am.LanguageServiceAnalysis()

    for shorthand_name in raw_attrs.keys():
      shorthand = self.shorthands[shorthand_name]
      located_name = cast(LocatedString, shorthand_name)

      shorthand.references.append(DiagnosticDocumentReference.from_value(located_name))

      if not shorthand.layer:
        if shorthand.preparing:
          shorthand.layer = Ellipsis
          analysis.errors.append(CircularReferenceError(located_name))
          continue

        shorthand.preparing = True
        shorthand.layer = analysis.add(shorthand.create_layer())

        if not isinstance(shorthand.layer, EllipsisType):
          assert (extra_info := shorthand.layer.extra_info) is not None

          if not isinstance(extra_info, EllipsisType) and ('_priority' in extra_info):
            shorthand.priority = extra_info['_priority'].value

    return analysis, None

  def enter_protocol(self, data: Attributes, /, envs):
    analysis = am.LanguageServiceAnalysis()

    if (attr := data.get('shorthands')):
      for name, data_shorthand in attr.items():
        symbol = self.fiber.allocate_eval_symbol()

        env = EvalEnv({
          'arg': am.EvalEnvValue(lambda node: ArgExprDef(node, symbol)),
          'args': am.EvalEnvValue(lambda node: ArgExprDef(node, symbol))
        }, symbol=symbol)

        create_layer = lambda data_shorthand = data_shorthand, env = env: self.fiber.parse_layer(data_shorthand, envs=[*envs, env], extra_attributes={
          '_priority': am.Attribute(
            am.IntType(),
            description="Sets the priority of the shorthand. Shorthands with a higher priority are executed before those with a lower priority when running a protocol.",
            default=0
          )
        }, mode='any')

        if isinstance(attr, ReliableLocatedDict):
          comments = attr.comments[name]
          regular_comments = [comment for comment in comments if not comment.startswith("@")]

          deprecated = any(comment == "@deprecated" for comment in comments)
          description = regular_comments[0].value if regular_comments else None
        else:
          deprecated = False
          description = None

        self.shorthands[name] = ShorthandStaticItem(
          create_layer=create_layer,
          definition_body_ref=am.DiagnosticDocumentReference.from_area(LocationArea([data_shorthand.area.enclosing_range()])),
          definition_full_ref=am.DiagnosticDocumentReference.from_area(LocationArea([(name.area + data_shorthand.area).enclosing_range()])),
          definition_name_ref=am.DiagnosticDocumentReference.from_area(LocationArea([name.area.single_range()])),
          deprecated=deprecated,
          description=description,
          references=list(),
          symbol=symbol
        )

    return analysis, ProtocolUnitData()

  def leave_protocol(self):
    analysis = am.LanguageServiceAnalysis()

    for shorthand in self.shorthands.values():
      if not shorthand.layer:
        analysis.markers.append(am.LanguageServiceMarker(
          "Unused shorthand",
          shorthand.definition_full_ref,
          kind='unnecessary'
        ))

        _ = analysis.add(shorthand.create_layer())

      if shorthand.deprecated:
        analysis.markers.append(am.LanguageServiceMarker(
          "Deprecated shorthand",
          shorthand.definition_name_ref,
          kind='deprecated'
        ))

      analysis.renames.append(am.LanguageServiceRename([
        shorthand.definition_name_ref,
        *shorthand.references
      ]))

      analysis.relations.append(am.LanguageServiceRelation(
        shorthand.definition_body_ref,
        shorthand.definition_name_ref,
        shorthand.references
      ))

    return analysis



@dataclass
class ShorthandProgramPoint(am.BaseProgramPoint):
  child: am.BaseProgramPoint

@dataclass
class ShorthandProgramLocation(am.BaseProgramLocation):
  pass

  def export(self):
    return dict()

class ShorthandProgram(BaseProgram):
  def __init__(self, block: 'ShorthandBlock', handle):
    super().__init__(block, handle)

    self._block = block
    self._handle = handle

    self._bypass_event = Event()
    self._child_program: Optional[ProgramOwner] = None

  def halt(self):
    if self._child_program:
      self._child_program.halt()
    else:
      self._bypass_event.set()

  async def run(self, point, stack):
    self._handle.send_location(ShorthandProgramLocation())

    analysis, result = await self._block.argument.evaluate_final_async(self._handle.context)
    self._handle.send_analysis(analysis)

    if isinstance(result, EllipsisType):
      await self._bypass_event.wait()
      return

    print(result)

    owner = self._handle.create_child(self._block.child)

    await owner.run(point, stack | {
      self._block.symbol: {
        (): result.value
      }
    })

@dataclass(slots=True)
class ShorthandBlock(am.BaseBlock):
  argument: am.Evaluable
  child: am.BaseBlock
  symbol: am.EvalSymbol

  def duration(self):
    return self.child.duration()

  def create_program(self, handle: ProgramHandle):
    return ShorthandProgram(self, handle)

  def import_point(self, data: Any):
    return self.child.import_point(data)

  def export(self, context):
    return {
      "name": "_",
      "namespace": namespace,
      "child": self.child.export(context),
      "duration": self.duration().export()
    }
