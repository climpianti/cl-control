"""Native update entity contract tests without a Home Assistant install."""

from __future__ import annotations

import importlib
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import AsyncMock

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "custom_components" / "cl_control"

class Features:
    INSTALL = 1
    RELEASE_NOTES = 2
    SPECIFIC_VERSION = 4
    PROGRESS = 8
    BACKUP = 16

class BaseEntity:
    def async_write_ha_state(self): self.writes = getattr(self, "writes", 0) + 1

update_stub = types.ModuleType("homeassistant.components.update")
update_stub.UpdateEntity = BaseEntity
update_stub.UpdateEntityFeature = Features
components = sys.modules.setdefault("homeassistant.components", types.ModuleType("homeassistant.components"))
sys.modules["homeassistant.components.update"] = update_stub
registry = types.ModuleType("homeassistant.helpers.device_registry")
registry.DeviceInfo = dict
sys.modules["homeassistant.helpers.device_registry"] = registry

package = types.ModuleType("cl_update_entity")
package.__path__ = [str(PACKAGE)]
sys.modules.setdefault("cl_update_entity", package)
module = importlib.import_module("cl_update_entity.update")


class UpdateEntityTests(unittest.IsolatedAsyncioTestCase):
    async def test_entity_uses_shared_manager_and_requests_restart(self):
        manifest = types.SimpleNamespace(version="3.3.1", summary="Fix", release_url="https://example.invalid")
        manager = types.SimpleNamespace(
            error=None, manifest=manifest, release_channel="stable", in_progress=False,
            progress=None, restart_required=False, async_refresh=AsyncMock(),
            async_release_notes=AsyncMock(return_value="Notes"), async_install=AsyncMock(),
        )
        entry = types.SimpleNamespace(data={"installation_id": "install"})
        entity = module.CLControlUpdateEntity(entry, manager)
        self.assertEqual(entity.latest_version, "3.3.1")
        self.assertEqual(entity.release_summary, "Fix")
        self.assertTrue(entity._attr_supported_features & Features.INSTALL)
        await entity.async_update()
        manager.async_refresh.assert_awaited_once()
        self.assertEqual(await entity.async_release_notes(), "Notes")
        await entity.async_install("3.3.1", False)
        manager.async_install.assert_awaited_once_with("3.3.1")
        self.assertEqual(entity.writes, 1)

    async def test_platform_adds_exactly_one_entity(self):
        manager = types.SimpleNamespace()
        hass = types.SimpleNamespace(data={"cl_control": {"update_manager": manager}})
        entry = types.SimpleNamespace(data={"installation_id": "install"})
        added = []
        await module.async_setup_entry(hass, entry, lambda entities, update: added.append((entities, update)))
        self.assertEqual(len(added), 1)
        self.assertEqual(len(added[0][0]), 1)
        self.assertTrue(added[0][1])


if __name__ == "__main__":
    unittest.main()
