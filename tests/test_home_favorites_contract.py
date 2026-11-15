"""Home favorites frontend and websocket contract regression tests."""
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]/"custom_components"/"cl_control"

class HomeFavoritesContractTests(unittest.TestCase):
    def test_atomic_persistent_toggle_and_dashboard_invalidation(self):
        source=(ROOT/"websocket.py").read_text()
        self.assertIn('"cl_control/favorites/toggle"',source)
        self.assertIn('favorites.remove(entity_id)',source)
        self.assertIn('favorites.append(entity_id)',source)
        self.assertIn('await data[DATA_STORE].async_save(runtime)',source)
        self.assertIn('data[DATA_NATIVE_DASHBOARD].invalidate()',source)

    def test_light_has_distinct_home_star_and_preset_palette(self):
        source=(ROOT/"frontend/cl-control-light-memories-card.mjs").read_text()
        self.assertIn('id="homeFavorite"',source)
        self.assertIn('id="favorites"',source)
        self.assertIn('mdi:palette-outline',source)
        self.assertIn('cl_control/favorites/toggle',source)
        self.assertIn('cl-control-home-favorites-changed',source)

    def test_home_card_updates_without_dashboard_regeneration(self):
        source=(ROOT/"frontend/cl-control-home-favorites-card.mjs").read_text()
        self.assertIn("cl_control/dashboard/native_config",source)
        self.assertIn("cl-control-home-favorites-changed",source)
        self.assertIn("createCardElement",source)
        native=(ROOT/"dashboard_native.py").read_text()
        self.assertIn("custom:cl-control-home-favorites-card",native)

if __name__=="__main__":unittest.main()
