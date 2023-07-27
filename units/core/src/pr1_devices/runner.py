import bisect
from asyncio import Event, Future, Task
from dataclasses import dataclass, field
from logging import Logger
from typing import Optional, Self

import automancer as am

from . import logger
from .program import PublisherProgram, ValueNodeValue


PublisherTrace = tuple[PublisherProgram, ...]

@dataclass
class Declaration:
  # Value is None => The value to set is unknown, keep the node claimed but with an undefined value.
  assignments: dict[am.ValueNode, Optional[am.NullType | object]]
  trace: PublisherTrace
  active: bool = True
  applied: bool = False

  def __lt__(self, other: Self):
    return len(self.trace) > len(other.trace)


@dataclass
class NodeInfo:
  candidate_count: int = 0
  claim: Optional[am.Claim] = None
  current_value: Optional[ValueNodeValue] = None
  update_event: Event = field(default_factory=Event)
  worker_task: Optional[Task[None]] = None


@am.provide_logger(logger)
class Runner(am.BaseRunner):
  def __init__(self, master):
    self._master = master

    self._declarations = list[Declaration]()
    self._node_infos = dict[am.ValueNode, NodeInfo]()

    self._logger: Logger
    self._pool: am.Pool


  async def start(self):
    try:
      async with am.Pool.open() as self._pool:
        await Future()
    finally:
      self._node_infos.clear()


  # Publisher methods

  def add(self, trace: PublisherTrace, assignments: dict[am.ValueNode, ValueNodeValue]):
    declaration = Declaration(assignments, trace)
    bisect.insort(self._declarations, declaration)

    for node, value in assignments.items():
      self._node_infos.setdefault(node, NodeInfo()).candidate_count += 1

    return declaration

  def remove(self, declaration: Declaration):
    self._declarations.remove(declaration)

    for node in declaration.assignments.keys():
      node_info = self._node_infos[node]
      node_info.candidate_count -= 1

  def update(self):
    for node, node_info in self._node_infos.items():
      node_value = next((declaration.assignments[node] for declaration in self._declarations if declaration.active and declaration.applied and (node in declaration.assignments)), None)

      if (node_value is not None) and  (node_info.current_value != node_value):
        node_info.current_value = node_value
        node_info.update_event.set()

      if (node_info.current_value is not None) and (not node_info.worker_task):
        node_info.worker_task = self._pool.start_soon(self._node_worker(node, node_info))


  # Applier methods

  def apply(self):
    for declaration in self._declarations:
      declaration.applied = True

    self.update()

  async def wait(self):
    for node, node_info in list(self._node_infos.items()):
      await node.writer.wait_settled() # TODO!!: Check

      if node_info.candidate_count < 1:
        del self._node_infos[node]

        if node_info.worker_task:
          node_info.worker_task.cancel()
          node_info.worker_task = None

  async def _node_worker(self, node: am.ValueNode, node_info: NodeInfo):
    self._logger.debug(f"Launching worker of node with id '{node.id}'")

    node_info.claim = node.writer.claim(marker=self._master)

    try:
      while True:
        await node_info.claim.wait()
        # info.current_candidate.item_info.notify(NodeStateLocation(info.current_candidate.value))

        while True:
          winner_index, _ = await am.race(
            node_info.update_event.wait(),
            node_info.claim.lost()
          )

          if winner_index == 1:
            break

          node_info.update_event.clear()
          node.writer.write(node_info.current_value)
    finally:
      node_info.claim.destroy()
      node_info.claim = None

      self._logger.debug(f"Removing worker of node with id '{node.id}'")
