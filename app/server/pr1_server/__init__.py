import asyncio
import collections
from pathlib import Path
import appdirs
import json
import logging
import subprocess
import sys
import websockets

from pr1 import Host, reader
from pr1.util import schema as sc

from .auth import agents as auth_agents


logging.basicConfig(level=logging.DEBUG, format="%(levelname)-8s :: %(name)-18s :: %(message)s")
logger = logging.getLogger("pr1.app")


class Backend:
  def __init__(self, data_dir):
    self.data_dir = data_dir

class Client:
  def __init__(self, *, authenticated, conn):
    self.authenticated = authenticated
    self.conn = conn

  @property
  def id(self):
    return self.conn.id


conf_schema = sc.Schema({
  'authentication': sc.Optional(sc.List(
    sc.Or(*[Agent.conf_schema for Agent in auth_agents.values()])
  )),
  'features': {
    'multiple_clients': sc.ParseType(bool),
    'restart': sc.ParseType(bool),
    'terminal': sc.ParseType(bool),
    'write_config': sc.ParseType(bool)
  },
  'hostname': str,
  'port': sc.ParseType(int),
  'version': sc.ParseType(int)
})

class App():
  version = 1

  def __init__(self):
    self.data_dir = Path(appdirs.user_data_dir("PR-1", "Hsn"))
    self.data_dir.mkdir(exist_ok=True)

    # if not self.data_dir.exists():
    #   try:
    #     self.data_dir.mkdir()
    #   except PermissionError:
    #     if sys.stdout.isatty():
    #       print("Authenticate to create the data directory")
    #       code = subprocess.call(["sudo", "mkdir", "-p", str(self.data_dir)])

    #       if code != 0:
    #         print("Could not create the data directory")
    #         sys.exit(1)
    #     else:
    #       print("Run again as root or interactively to create the data directory")
    #       sys.exit(1)

    conf_path = self.data_dir / "app.yml"

    if conf_path.exists():
      try:
        conf = reader.loads((self.data_dir / "app.yml").open().read())
        conf = conf_schema.transform(conf)
      except reader.LocatedError as e:
        e.display()
        sys.exit(1)

      if conf['version'] > self.version:
        raise Exception("Incompatible version")

      updated_conf = False

      if 'authentication' in conf:
        for index, conf_method in enumerate(conf['authentication']):
          Agent = auth_agents[conf_method['type']]

          if hasattr(Agent, 'update_conf'):
            updated_conf_method = Agent.update_conf(conf_method)

            if updated_conf_method:
              conf['authentication'][index] = updated_conf_method
              updated_conf = True

    else:
      conf = {
        'features': {
          'multiple_clients': True,
          'restart': False,
          'terminal': False,
          'write_config': False
        },
        'hostname': "127.0.0.1",
        'port': 4567,
        'version': self.version
      }

      updated_conf = True

    if updated_conf:
      conf_path.open("w").write(reader.dumps(conf))

    self.conf = conf
    self.host = Host(backend=Backend(data_dir=self.data_dir), update_callback=self.update)
    self.clients = dict()
    self.server = None

    self.updating = False

    # id: hex(hash(json.dumps({ 'passwd': 'foobar' }, sort_keys=True)))[2:]
    self.auth_agents = [
      auth_agents[conf_method['type']](conf_method) for conf_method in conf['authentication']
    ] if 'authentication' in conf else None


  async def handle_client(self, client):
    await client.conn.send(json.dumps({
      "authMethods": [
        agent.export() for agent in self.auth_agents
      ] if self.auth_agents else None,
      "version": self.version
    }))

    if self.auth_agents:
      while True:
        message = json.loads(await client.conn.recv())
        agent = self.auth_agents[message["authMethodIndex"]]

        if agent.test(message["data"]):
          await client.conn.send(json.dumps({ "ok": True }))
          break
        else:
          await client.conn.send(json.dumps({ "ok": False, "message": "Invalid credentials" }))

    client.authenticated = True

    await client.conn.send(json.dumps({
      "type": "state",
      "data": self.host.get_state()
    }))

    async for msg in client.conn:
      message = json.loads(msg)

      if message["type"] == "request":
        response_data = await self.host.process_request(message["data"])

        await client.conn.send(json.dumps({
          "type": "response",
          "id": message["id"],
          "data": response_data
        }))

  def broadcast(self, message):
    websockets.broadcast([client.conn for client in self.clients.values()], message)

  def update(self):
    if not self.updating:
      self.updating = True

      def send_state():
        self.broadcast(json.dumps({
          "type": "state",
          "data": self.host.get_state()
        }))

        self.updating = False

      loop = asyncio.get_event_loop()
      loop.call_soon(send_state)

  def start(self):
    loop = asyncio.get_event_loop()

    # Debug
    # chip, codes, draft = self.host._debug()
    # self.host.start_plan(chip=chip, codes=codes, draft=draft, update_callback=self.update)

    loop.run_until_complete(self.host.initialize())

    # async def task():
    #   try:
    #     await asyncio.sleep(2)
    #     await self.server.close()
    #   except asyncio.CancelledError:
    #     print("Cancelled")
    # t = loop.create_task(task())
    # t = loop.create_task(task())

    loop.create_task(self.serve())
    loop.create_task(self.host.start())

    try:
      loop.run_forever()
    except KeyboardInterrupt:
      logger.info("Stopping due to a keyboard interrupt")

      tasks = asyncio.all_tasks(loop)
      logger.debug(f"Cancelling {len(tasks)} tasks")

      all_tasks = asyncio.gather(*tasks)
      all_tasks.cancel()

      try:
        loop.run_until_complete(all_tasks)
      except asyncio.CancelledError:
        pass

      # all_tasks.exception()
    finally:
      loop.close()

  async def serve(self):
    async def handler(conn):
      if self.conf['features']['multiple_clients'] and (len(self.clients) > 1):
        return

      client = Client(authenticated=False, conn=conn)
      self.clients[client.id] = client

      try:
        await self.handle_client(client)
      finally:
        del self.clients[client.id]

    hostname = self.conf['hostname']
    port = self.conf['port']

    logger.debug(f"Websockets listening on {hostname}:{port}")

    self.server = await websockets.serve(handler, host=hostname, port=port)

    try:
      await self.server.wait_closed()
    except asyncio.CancelledError:
      self.server.close()
      # await self.server.wait_closed()


def main():
  app = App()
  app.start()