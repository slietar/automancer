from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, cast, final

import automancer as am
from quantops import Quantity

from . import namespace
from .executor import Executor


class ProcessData(Protocol):
  exposure: Quantity
  objective: str
  optconf: str
  output: Path
  z_offset: Quantity


@dataclass(frozen=True, slots=True)
class ProcessPoint(am.BaseProcessPoint):
  pass

@dataclass(frozen=True, slots=True)
class ProcessLocation(am.Exportable):
  def export(self):
    return {}

@final
class Process(am.BaseClassProcess[ProcessData, ProcessLocation, ProcessPoint]):
  name = "capture"
  namespace = namespace

  async def __call__(self, context: am.ProcessContext[ProcessData, ProcessLocation, ProcessPoint]):
    from .settings_program import Program

    executor = cast(Executor, context.executor)
    settings_program = context.handle.ancestor(type=Program)

    if not settings_program:
      raise am.ProcessFailureError("Missing capture settings; add a `capture_settings:` attribute to the same or a parent block")

    if settings_program.points is None:
      raise am.ProcessFailureError("No points registered")

    context.logger.debug("Starting capture")

    assert settings_program.settings

    await executor.capture(
      chip_count=settings_program.settings.chip_count,
      exposure=(context.data.exposure / am.ureg.millisecond).magnitude,
      objective=context.data.objective,
      optconf=context.data.optconf,
      output_path=context.data.output,
      points=settings_program.points,
      z_offset=(context.data.z_offset / am.ureg.micrometer).magnitude
    )

    context.logger.debug("Finished capture")

process = Process()
