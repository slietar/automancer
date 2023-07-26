from importlib.resources import files

import automancer as am


namespace = am.PluginName("shorthands")
version = 0

metadata = am.Metadata(
  description="Shorthands",
  icon=am.MetadataIcon(kind='icon', value="description"),
  title="Shorthands",
  version="2.0"
)

client_path = files(__name__ + '.client')
logger = am.logger.getChild(namespace)

from .parser import Parser
