"""Includes inherited registry regression plus approval persistence checks."""
from copy import deepcopy

import test_scoring_boundary_emulator as boundary
from scoring_test_application import ScoringTestApplication
from test_scoring_test_application import request, specification


class ApplicationEmulatorTests(boundary.RegistryEmulatorTests):
    def register_with_audit(self):
        # The inherited fixture is our own guarded local-only disabled document.
        self.ref.delete()
        self.app = ScoringTestApplication(self.registry)
        self.data = {"run": deepcopy(self.run), "executionManifest": specification(self.run)}
        return self.app.register_from_callable(request(self.data))

    def test_audit_and_registry_created_together(self):
        result = self.register_with_audit()
        stored = self.ref.get().to_dict()
        self.assertEqual(stored["status"], "disabled")
        self.assertEqual(stored["requestCount"], 0)
        self.assertEqual(stored["approvalAudit"]["approvalHash"], result["approvalHash"])
        self.assertEqual(stored["approvalAudit"]["approvedSpecification"], self.data)

    def test_duplicate_registration_preserves_original(self):
        from google.api_core.exceptions import AlreadyExists
        self.register_with_audit()
        before = self.ref.get().to_dict()
        self.data["executionManifest"]["deploymentVersion"] = "replacement"
        with self.assertRaises(AlreadyExists):
            self.app.register_from_callable(request(self.data))
        self.assertEqual(self.ref.get().to_dict(), before)

    def test_stop_keeps_approval(self):
        self.register_with_audit()
        before = self.ref.get().to_dict()["approvalAudit"]
        self.app.stop_from_callable(request({"runId": self.run["runId"]}))
        stored = self.ref.get().to_dict()
        self.assertEqual(stored["status"], "stopped")
        self.assertEqual(stored["approvalAudit"], before)
