import asyncio
from dataclasses import dataclass
import traceback
from typing import TYPE_CHECKING, Any, AsyncGenerator, Callable, Optional

from ..state import StateInstanceCollection
from ..error import MasterError
from .process import ProgramExecEvent
from .eval import EvalStack
from ..units.base import BaseRunner
from .parser import BlockProgram, BlockState, FiberProtocol
from ..chip import Chip
from ..devices.claim import ClaimSymbol
from ..util.iterators import DynamicParallelIterator
from ..ureg import ureg

if TYPE_CHECKING:
  from ..host import Host


class Master:
  def __init__(self, protocol: FiberProtocol, /, chip: Chip, *, host: 'Host'):
    self.chip = chip
    self.host = host
    self.protocol = protocol

    self._child_state_terminated: bool
    self._child_stopped: bool
    self._errors = list[MasterError]()
    self._events = list[ProgramExecEvent]()
    self._program: BlockProgram
    self._location: Any

    self._done_future: Optional[asyncio.Future] = None
    self._pause_future: Optional[asyncio.Future] = None

  def halt(self):
    self._program.halt()

  def pause(self):
    self._program.pause()

    # Only set the future after in case the call was illegal and is rejected by the child program.
    self._pause_future = asyncio.Future()

  async def wait_done(self):
    assert self._done_future
    await self._done_future

  async def wait_halt(self):
    self.halt()
    await self.wait_done()

  async def wait_pause(self):
    self.pause()

    assert self._pause_future
    await self._pause_future

  def resume(self):
    self._program.resume()

  async def run(self, initial_location = None):
    symbol = ClaimSymbol()

    self._program = self.protocol.root.Program(block=self.protocol.root, master=self, parent=self)

    self._child_state_terminated = False
    self._child_stopped = True

    from random import random

    runtime_stack = {
      self.protocol.global_env: dict(
        random=random,
        unit=ureg
      ),
      self.protocol.user_env: dict()
    }

    async for event in self._program.run(initial_location, None, runtime_stack, symbol):
      self._errors += event.errors

      # Write the state if the state child program was terminated and is not anymore, i.e. it was replaced.
      if self._child_state_terminated and (not event.state_terminated):
        self.write_state(); print("Y: Master3")

      # Write the state if the state child program was paused and is not anymore.
      elif self._child_stopped and (not event.stopped):
        self.write_state(); print("Y: Master1")

      # Transfer and write the state if the state child program is paused but not terminated.
      if event.stopped and not (event.state_terminated):
        self.transfer_state(); print("X: Master2")
        self.write_state(); print("Y: Master2")

      self._child_state_terminated = event.state_terminated
      self._child_stopped = event.stopped

      yield event

      if event.stopped and self._pause_future:
        self._pause_future.set_result(True)
        self._pause_future = None

    self.transfer_state()
    self.write_state()

  async def call_resume(self):
    self.transfer_state(); print("X: Master1")

  def send_message(self, block_path: list, exec_path: list, message: object):
    program = self._program

    for block_key, exec_key in zip(block_path, exec_path):
      program = program.get_child(block_key, exec_key)

    program.import_message(message)

  async def start(self, done_callback: Callable, update_callback: Callable):
    async def run_loop():
      nonlocal start_future

      try:
        async for event in self.run():
          self._events.append(event)

          if event.location:
            self._location = event.location

          if start_future:
            start_future.set_result(None)
            start_future = None
          elif not event.terminated:
            update_callback()

        done_callback()

        assert self._done_future
        self._done_future.set_result(None)
      except Exception:
        traceback.print_exc()

    start_future = asyncio.Future()

    self._done_future = asyncio.Future()
    self._task = asyncio.create_task(run_loop())

    await start_future

  def create_instance(self, state: BlockState, *, notify: Callable, stack: EvalStack, symbol: ClaimSymbol):
    runners = { namespace: runner for namespace, runner in self.chip.runners.items() if state.get(namespace) }
    return StateInstanceCollection(state, notify=notify, runners=runners, stack=stack, symbol=symbol)

  def transfer_state(self):
    for runner in self.chip.runners.values():
      runner.transfer_state()

  def write_state(self):
    for runner in self.chip.runners.values():
      runner.write_state()

  def export(self):
    return {
      "errors": [error.export() for error in self._errors],
      "location": self._location.export(),
      "protocol": self.protocol.export()
    }
