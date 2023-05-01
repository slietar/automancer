import functools
from dataclasses import dataclass
from types import EllipsisType
from typing import TYPE_CHECKING, Any, Literal

from pr1.devices.nodes.collection import CollectionNode
from pr1.devices.nodes.common import BaseNode, NodePath
from pr1.devices.nodes.numeric import NumericNode
from pr1.devices.nodes.primitive import BooleanNode, EnumNode
from pr1.devices.nodes.value import ValueNode
from pr1.fiber.eval import EvalContext, EvalEnv, EvalEnvValue
from pr1.fiber.expr import Evaluable
from pr1.fiber.langservice import (Analysis, AnyType, Attribute, EnumType,
                                   PotentialExprType, PrimitiveType,
                                   QuantityType)
from pr1.fiber.parser import (BaseParser, BasePassiveTransformer,
                              BlockUnitState, FiberParser, ProtocolUnitData,
                              ProtocolUnitDetails, TransformerAdoptionResult)
from pr1.fiber.staticanalysis import (ClassDef, ClassRef, CommonVariables,
                                      StaticAnalysisAnalysis)
from pr1.reader import LocatedValue
from pr1.state import StatePublisherBlock
from pr1.util.decorators import debug

from . import namespace

if TYPE_CHECKING:
  from .runner import DevicesRunner


EXPR_DEPENDENCY_METADATA_NAME = f"{namespace}.dependencies"

@dataclass(eq=True, frozen=True, kw_only=True)
class NodeDependencyMetadata:
  endpoint: Literal['connected', 'value']
  path: NodePath

NodeDependenciesMetadata = set[NodeDependencyMetadata]

class TrackedReadableNodeClassRef(ClassRef):
  def __init__(self, type_def: ClassDef, /, metadata: NodeDependencyMetadata):
    super().__init__(type_def)
    self.metadata = metadata

  def analyze_access(self):
    return StaticAnalysisAnalysis(metadata={
      EXPR_DEPENDENCY_METADATA_NAME: NodeDependenciesMetadata({self.metadata})
    })


class CollectionNodeWrapper:
  def __init__(self, node: CollectionNode, /):
    for child_node in node.nodes.values():
      if (wrapped_node := wrap_node(child_node)):
        setattr(self, child_node.id, wrapped_node)

class NumericReadableNodeWrapper:
  def __init__(self, node: NumericNode):
    self._node = node

  @property
  def value(self):
    return self._node.value


def wrap_node(node: BaseNode, /):
  match node:
    case CollectionNode():
      return CollectionNodeWrapper(node)
    case NumericNode() if node.readable:
      return NumericReadableNodeWrapper(node)
    case _:
      return None


@dataclass
class DevicesProtocolDetails(ProtocolUnitDetails):
  env: EvalEnv

  def create_runtime_stack(self, runner: 'DevicesRunner'):
    return {
      self.env: {
        'devices': wrap_node(runner._host.root_node)
      }
    }


class Transformer(BasePassiveTransformer):
  priority = 100

  def __init__(self, parser: 'Parser'):
    self._parser = parser

  @functools.cached_property
  def attributes(self):
    def get_type(node):
      match node:
        case BooleanNode():
          return PrimitiveType(bool)
        case EnumNode():
          return EnumType(*[case.id for case in node.cases])
        case NumericNode():
          return QuantityType(node.unit, allow_nil=node.nullable, min=node.min, max=node.max)
        case _:
          return AnyType()

    return { key: Attribute(
      description=(node.description or f"""Sets the value of "{node.label or node.id}"."""),
      documentation=([f"Unit: {node.unit:~P}"] if isinstance(node, NumericNode) and node.unit else None),
      label=node.label,
      optional=True,
      type=PotentialExprType(get_type(node))
    ) for key, (node, path) in self._parser.node_map.items() }

  def adopt(self, data: dict[str, Evaluable[LocatedValue[Any]]], /, adoption_stack):
    analysis = Analysis()
    values = dict[NodePath, Evaluable[LocatedValue[Any]]]()

    for key, value in data.items():
      node, path = self._parser.node_map[key]
      value = analysis.add(value.eval(EvalContext(adoption_stack), final=False))

      if not isinstance(value, EllipsisType):
        values[path] = value

    if values:
      return analysis, TransformerAdoptionResult(values)
    else:
      return analysis, None

  def execute(self, data: dict[NodePath, Evaluable[LocatedValue[Any]]], /, block):
    return Analysis(), StatePublisherBlock(block)


class Parser(BaseParser):
  namespace = namespace

  def __init__(self, fiber: FiberParser):
    self._fiber = fiber
    self.transformers = [Transformer(self)]

  @functools.cached_property
  def node_map(self):
    queue: list[tuple[BaseNode, NodePath]] = [(self._fiber.host.root_node, NodePath())]
    nodes = dict[str, tuple[BaseNode, NodePath]]()

    while queue:
      node, node_path = queue.pop()

      if isinstance(node, CollectionNode):
        for child_node in node.nodes.values():
          queue.append((
            child_node,
            NodePath((*node_path, child_node.id))
          ))

      if isinstance(node, ValueNode) and node.writable:
        nodes[".".join(node_path)] = node, node_path

    return nodes

  def enter_protocol(self, attrs, /, adoption_envs, runtime_envs):
    def create_type(node: BaseNode, parent_path: NodePath = ()):
      node_path = (*parent_path, node.id)
      connected_ref = TrackedReadableNodeClassRef(
        CommonVariables['bool'],
        NodeDependencyMetadata(
          endpoint='connected',
          path=node_path
        )
      )

      match node:
        case CollectionNode():
          return ClassRef(ClassDef(
            name=node.id,
            instance_attrs={
              'connected': connected_ref,
              **{ child_node.id: child_node_type for child_node in node.nodes.values() if (child_node_type := create_type(child_node, node_path)) }
            }
          ))
        case NumericNode() if node.readable:
          return ClassRef(ClassDef(
            name=node.id,
            instance_attrs={
              'connected': connected_ref,
              'value': TrackedReadableNodeClassRef(
                CommonVariables['unknown'],
                NodeDependencyMetadata(
                  endpoint='value',
                  path=node_path
                )
              )
            }
          ))
        case _:
          return None

    env = EvalEnv({
      'devices': EvalEnvValue(
        type=ClassRef(ClassDef(
          name='Devices',
          instance_attrs={
            device_node.id: device_node_type for device_node in self._fiber.host.root_node.nodes.values() if (device_node_type := create_type(device_node))
          }
        ))
      )
    }, name="Devices", readonly=True)

    return Analysis(), ProtocolUnitData(details=DevicesProtocolDetails(env), runtime_envs=[env])


@debug
class DevicesState(BlockUnitState):
  def __init__(self, values: dict[NodePath, Evaluable]):
    self.values = values

  def export(self) -> object:
    return {
      "values": [
        [path, value.export()] for path, value in self.values.items()
      ]
    }
