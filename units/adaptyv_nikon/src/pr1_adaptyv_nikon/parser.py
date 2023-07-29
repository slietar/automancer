from dataclasses import dataclass
import comserde
from typing import Any, Protocol, cast

import automancer as am
from pr1.fiber.master2 import ProgramHandle
from pr1.fiber.parser import BaseProgram, BaseProgramPoint
from pr1.reader import LocatedValue

from . import namespace
from .executor import Executor
from .capture_process import process


class Settings(Protocol):
  chip_columns: int
  chip_count: int
  chip_rows: int

class CaptureContextTransformer(am.BasePassiveTransformer):
  def __init__(self):
    super().__init__({
      'capture_settings': am.Attribute(
        description="Set capture settings.",
        type=am.AutoExprContextType(
          am.RecordType({
            'chip_count': am.Attribute(
              am.IntType(mode='positive'),
              description="The number of chips to capture, such as `3`."
            ),
            'grid_columns': am.Attribute(
              am.IntType(mode='positive'),
              description="The number of columns in the grid, such as `64`."
            ),
            'grid_rows': am.Attribute(
              am.IntType(mode='positive'),
              description="The number of rows in the grid, such as `16`."
            )
          })
        )
      )
    }, priority=1000)

  def execute(self, data, /, block):
    return am.BaseAnalysis(), SettingsBlock(block, data['capture_settings'])

@comserde.serializable
@dataclass
class SettingsBlock(am.BaseBlock):
  child: am.BaseBlock
  settings: am.Evaluable[LocatedValue[Settings]]

  def __get_node_children__(self):
    return [self.child]

  def create_program(self, handle):
    from .settings_program import Program
    return Program(self, handle)

  def duration(self):
    return self.child.duration()

  def import_point(self, data):
    raise NotImplementedError

  def export(self, context) -> object:
    return {
      "name": "settings",
      "namespace": namespace,
      "child": self.child.export(context),
      "duration": self.duration().export()
    }


class Parser(am.BaseParser):
  namespace = namespace

  def __init__(self, fiber):
    super().__init__(fiber)

    executor = cast(Executor, fiber.host.executors[namespace])
    objectives = executor._objectives
    optconfs = executor._optconfs

    assert objectives is not None
    assert optconfs is not None

    self.transformers = [am.ProcessTransformer(process, {
      'capture': am.Attribute(
        description="Capture images on the Nikon Ti-2E microscope.",
        documentation=["A `capture_settings:` attribute must be present of the same or a parent block in order to specify the chip count and grid size."],
        type=am.RecordType({
          'exposure': am.Attribute(
            am.QuantityType('millisecond'),
            description="The exposure time for each image, such as `100 ms`."
          ),
          'objective': am.Attribute(
            am.EnumType(*objectives),
            description="The objective to use, such as `Plan Fluor 20x DIC N2`.",
            documentation=["Possible objectives:\n" + "\n".join(f"- `{objective}`" for objective in objectives)]
          ),
          'optconf': am.Attribute(
            am.EnumType(*optconfs),
            description="The optical configuration to use, such as `Kinetix - All Devices:FITC`.",
            documentation=["Possible optical configurations:\n" + "\n".join(f"- `{optconf}`" for optconf in optconfs)]
          ),
          'output': am.Attribute(
            am.PathType(),
            description="The path to save the images to, usually with a .nd2 extension, such as `images/chip{}.nd2`.",
            documentation=["The path must include `{}` which will be replaced with the chip number, starting at 0, even if there is only a single chip."]
          ),
          'z_offset': am.Attribute(
            am.QuantityType('micrometer'),
            default=(0.0 * am.ureg.µm),
            description="An offset on the Z axis compared to registered grid. Defaults to 0 µm."
          )
        })
      )
    }, parser=fiber), CaptureContextTransformer()]
