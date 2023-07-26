from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, cast, final

import automancer as am
from quantops import Quantity

from . import namespace
from .executor import Executor
from .runner import Runner


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
    runner = cast(Runner, context.executor)

    settings_program = context.handle.ancestor(type=Program)

    if not settings_program:
      raise am.ProcessFailureError("Missing capture settings. Add a `capture_settings:` attribute to the same or a parent block.")

    # if runner._points is None:
    #   raise am.ProcessFailureError("No points registered")

    context.logger.debug("Starting capture")

    print(context.data)

    import asyncio
    await asyncio.sleep(1)

    # await executor.capture(
    #   chip_count=runner._chip_count,
    #   exposure=(context.data.exposure / am.ureg.millisecond).magnitude,
    #   objective=context.data.objective,
    #   optconf=context.data.optconf,
    #   output_path=context.data.save,
    #   points=runner._points,
    #   z_offset=(context.data.z_offset / am.ureg.micrometer).magnitude
    # )

    context.logger.debug("Finished capture")

process = Process()
