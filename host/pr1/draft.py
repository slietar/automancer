class Draft:
  def __init__(self, *, id, analysis):
    self.analysis = analysis
    self.id = id

  def export(self):
    return {
      "diagnostics": [
        *[{ "kind": "error", **error.diagnostic().export() } for error in self.analysis.errors],
        *[{ "kind": "warning", **warning.diagnostic().export() } for warning in self.analysis.warnings]
      ],
      "folds": [fold.export() for fold in self.analysis.folds],
      "hovers": [hover.export() for hover in self.analysis.hovers],

      "protocol": None, # self.protocol.export(),
      "valid": False
    }


class DraftDiagnostic:
  def __init__(self, message, *, ranges = list()):
    self.message = message
    self.ranges = ranges

  def export(self):
    return {
      "message": self.message,
      "ranges": [[range.start, range.end] for range in self.ranges]
    }

class DraftGenericError:
  def __init__(self, message, *, ranges = list()):
    self.message = message
    self.ranges = ranges

  def diagnostic(self):
    return DraftDiagnostic(self.message, ranges=self.ranges)
