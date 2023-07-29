from dataclasses import dataclass
import numpy as np
from typing import Any, Optional, cast
import automancer as am
import comserde

from . import namespace
from .executor import Executor
from .parser import Settings, SettingsBlock


@comserde.serializable
@dataclass(frozen=True, slots=True)
class ProgramLocation(am.BaseProgramLocation):
  points_saved: bool
  settings: Optional[Settings] = None

  def export(self, context) -> dict:
    return {
      "pointsSaved": self.points_saved,
      "settings": self.settings and {
        "chipCount": self.settings.chip_count,
        "gridColumns": self.settings.chip_columns,
        "gridRows": self.settings.chip_rows
      }
    }


class Program(am.BaseProgram):
  def __init__(self, block: SettingsBlock, handle):
    super().__init__(block, handle)

    self._block = block
    self._handle = handle

    self._executor = cast(Executor, handle.master.host.executors[namespace])
    self._owner: am.ProgramOwner

    self.points: Optional[np.ndarray]
    self.settings: Optional[Settings]

  def halt(self):
    self._owner.halt()

  async def query(self):
    assert self.settings

    self.points = await self._executor.query(chip_count=self.settings.chip_count)
    self._send_location()

  async def requery(self):
    assert self.points is not None
    assert self.settings

    points = await self._executor.requery(chip_count=self.settings.chip_count, points=self.points)

    if points is not None:
      self.points = points

    self._send_location()

  def receive(self, message):
    match message["type"]:
      case "query":
        self._handle.master._pool.start_soon(self.query())
      case "requery":
        self._handle.master._pool.start_soon(self.requery())
      case _:
        return super().receive(message)

  def _send_location(self):
    self._handle.send_location(ProgramLocation(
      points_saved=(self.points is not None),
      settings=self.settings
    ))

  async def run(self, point, stack):
    self.points = None
    self.settings = None

    self._send_location()
    self._owner = self._handle.create_child(self._block.child)

    analysis, settings  = await self._block.settings.evaluate_final_async(am.EvalContext(stack))

    self._handle.send_analysis(analysis)

    if isinstance(settings, am.EllipsisType):
      raise Exception("Invalid settings")

    self.points = None
    self.settings = settings.dislocate()
    self._send_location()

    await self._owner.run(point, stack)

    del self._owner
    del self.points
    del self.settings
