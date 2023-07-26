from dataclasses import dataclass
from typing import Optional
import automancer as am
import comserde

from .parser import Settings, SettingsBlock


@comserde.serializable
@dataclass(frozen=True, slots=True)
class ProgramLocation(am.BaseProgramLocation):
  settings: Optional[Settings] = None

  def export(self, context) -> dict:
    return {
      "settings": self.settings and {
        "chipCount": self.settings.chip_count,
        "gridColumns": self.settings.grid_columns,
        "gridRows": self.settings.grid_rows
      }
    }


class Program(am.BaseProgram):
  def __init__(self, block: SettingsBlock, handle):
    super().__init__(block, handle)

    self._block = block
    self._handle = handle

    self._owner: am.ProgramOwner

    self.settings: Settings

  def halt(self):
    self._owner.halt()

  async def run(self, point, stack):
    self._handle.send_location(ProgramLocation())
    self._owner = self._handle.create_child(self._block.child)

    analysis, settings  = await self._block.settings.evaluate_final_async(am.EvalContext(stack))

    self._handle.send_analysis(analysis)

    if isinstance(settings, am.EllipsisType):
      raise Exception("Invalid settings")

    self.settings = settings.dislocate()
    self._handle.send_location(ProgramLocation(self.settings))

    await self._owner.run(point, stack)

    del self._owner
    del self.settings
