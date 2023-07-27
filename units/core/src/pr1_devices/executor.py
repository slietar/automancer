from asyncio import Future
from typing import Any

import automancer as am
from quantops import Quantity

from . import logger


ClaimKey = tuple[Any, am.ValueNode]

class Executor(am.BaseExecutor):
  def __init__(self, conf, *, host: am.Host):
    self._channels = set()
    self._claims = dict[ClaimKey, am.Claim]()
    self._host = host

    # from .mock import MockDevice
    # dev = MockDevice()
    # self._host.devices[dev.id] = dev

  def _claim_node(self, node: am.ValueNode, /, agent: Any):
    key: ClaimKey = agent, node

    if not key in self._claims:
      claim = node.writer.claim(agent, force=True)
      self._claims[key] = claim

      agent.pool.start_soon(self._node_claim_worker(claim, key, agent))

  async def _node_claim_worker(self, claim: am.Claim, key: ClaimKey, /, agent: Any):
    try:
      await claim.wait()
      await claim.lost()
    finally:
      if claim.alive:
        claim.destroy()

      del self._claims[key]


  async def request(self, request, /, agent):
    match request["type"]:
      case "claim":
        node = self._host.root_node.find(request["nodePath"])

        assert isinstance(node, am.ValueNode)
        assert node.writable

        self._claim_node(node, agent)

        return None
      case "listen":
        channel = agent.register_generator_channel(self._listen())
        self._channels.add(channel)

        return {
          "channelId": channel.id
        }
      case "release":
        node = self._host.root_node.find(request["nodePath"])

        if node and isinstance(node, am.ValueNode) and (claim := self._claims.get((agent, node))):
          claim.destroy()
      case "write":
        node = self._host.root_node.find(request["nodePath"])

        assert isinstance(node, am.ValueNode)
        assert node.writable

        self._claim_node(node, agent)

        match request["value"]["type"]:
          case "default":
            value = request["value"]["innerValue"]

            match node:
              case am.NumericNode():
                node.writer.write(Quantity(
                  dimensionality=node.context.dimensionality,
                  registry=am.ureg,
                  value=value["magnitude"]
                ))
              case am.BooleanNode() | am.EnumNode():
                node.writer.write(value)
          case "null":
            assert node.nullable
            node.writer.write(am.Null)

  async def _listen(self):
    all_nodes = list(self._host.root_node.iter_all())
    node_paths_by_node = { node: node_path for node_path, node in all_nodes }

    watcher = am.Watcher([node for _, node in all_nodes], modes={'connection', 'ownership', 'value', 'target'})

    async with watcher:
      yield [[node_path, export_node_state(node)] for node_path, node in all_nodes]

      async for event in watcher:
        yield [[node_paths_by_node[node], export_node_state(node)] for node, _ in event.items()]

  async def start(self):
    yield

    try:
      await Future()
    finally:
      for channel in self._channels:
        await channel.close()

      self._channels.clear()

      logger.info("Stopped watching all nodes")

  def export(self):
    return {
      "root": self._host.root_node.export()
    }


def export_node_state(node: am.BaseNode, /) -> object:
  state = {
    "connected": node.connected,
    "valueEvent": None,
    "writer": None
  }

  if isinstance(node, am.ValueNode):
    state |= {
      "valueEvent": (node.value and {
        "time": (node.value[0] * 1000),
        "value": node.export_value(node.value[1])
      })
    }

    if node.writable:
      owner = node.writer.owner()

      state |= {
        "writer": {
          "owner": (export_claim_marker(owner.marker) if owner else None),
          "targetValueEvent": ((target_value := node.writer.target_value) and {
            "time": (target_value[0] * 1000),
            "value": node.export_value(node.writer.target_value[1])
          })
        }
      }

  return state

def export_claim_marker(marker: Any, /) -> object:
  match marker:
    case am.Master():
      return {
        "type": "master",
        "experimentId": marker.experiment.id
      }
    case _:
      return {
        "type": "user"
      }
    # case _:
    #   return {
    #     "type": "unknown"
    #   }
