"""Behavior and security tests for persistent personal light snapshots."""
from copy import deepcopy
from types import SimpleNamespace
import unittest

from custom_components.cl_control.light_memories import (
    LightMemoryLibrary, capture_light, validate_snapshot,
)


def light(state="on", mode="rgb", **attributes):
    attrs = {"supported_color_modes": [mode], "color_mode": mode,
             "brightness": 100, "rgb_color": (32, 64, 128)}
    attrs.update(attributes)
    return SimpleNamespace(state=state, attributes=attrs)


class SnapshotTests(unittest.TestCase):
    def test_rgb_captures_one_color_representation(self):
        state = capture_light(light(hs_color=(45, 60), xy_color=(.2, .4), secret="never"))
        self.assertEqual(state, {"state": "on", "color_mode": "rgb", "brightness": 100, "rgb_color": [32, 64, 128]})

    def test_rgbw_captures_white_channel(self):
        self.assertEqual(capture_light(light(mode="rgbw", rgbw_color=(1, 2, 3, 44)))["rgbw_color"], [1, 2, 3, 44])

    def test_temperature_uses_kelvin(self):
        state = capture_light(light(mode="color_temp", color_temp_kelvin=2700, color_temp=370))
        self.assertEqual(state["color_temp_kelvin"], 2700)
        self.assertNotIn("color_temp", state)

    def test_off_does_not_restore_stale_attributes(self):
        self.assertEqual(capture_light(light(state="off")), {"state": "off"})

    def test_preset_requires_on_and_dimmable(self):
        for state in (light(state="off"), light(mode="onoff")):
            with self.assertRaises(ValueError):
                capture_light(state, preset=True)

    def test_offline_and_group_rejected(self):
        for state in (None, light(state="unavailable"), light(entity_id=["light.secret"])):
            with self.assertRaises(ValueError): capture_light(state)

    def test_invalid_brightness_rejected(self):
        for value in (None, float("nan"), float("inf"), -1, 256, True, 100.5):
            with self.assertRaises(ValueError): capture_light(light(brightness=value))

    def test_missing_and_bad_color_rejected(self):
        for value in (None, [1, 2], [1, 2, 256], [1, 2, "3"]):
            with self.assertRaises(ValueError): capture_light(light(rgb_color=value))

    def test_client_control_fields_rejected(self):
        with self.assertRaises(ValueError):
            validate_snapshot({"state": "on", "service": "unlock"})

    def test_incomplete_mode_rejected(self):
        with self.assertRaises(ValueError): capture_light(light(color_mode=None))


class FakeStore:
    def __init__(self): self.saved = None; self.fail = False
    async def async_load(self): return deepcopy(self.saved)
    async def async_save(self, value):
        if self.fail: raise OSError("disk full")
        self.saved = deepcopy(value)


class MemoryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.store = FakeStore()
        self.states = {"light.a": light(), "light.b": light(state="off")}
        self.library = LightMemoryLibrary(self.store, self.states.get)
        self.allowed = lambda entity, policy: True
        self.applied = []
    async def capture(self, kind="scene", entities=None):
        return await self.library.async_capture("alice", self.allowed, "Lettura", entities or ["light.a"], kind)
    async def apply(self, states): self.applied.append(states)

    async def test_capture_persists_without_actuating(self):
        item = await self.capture()
        self.assertEqual(self.applied, [])
        self.assertNotIn("owner", item)
        self.assertEqual(len(self.store.saved["items"]), 1)

    async def test_restart_recovers_same_snapshot(self):
        item = await self.capture("preset")
        restarted = LightMemoryLibrary(self.store, self.states.get)
        await restarted.async_load()
        self.assertEqual((await restarted.async_list("alice", self.allowed))[0]["states"], item["states"])

    async def test_other_user_cannot_list_apply_delete(self):
        item = await self.capture()
        self.assertEqual(await self.library.async_list("bob", self.allowed), [])
        with self.assertRaises(ValueError): await self.library.async_delete("bob", item["id"])
        with self.assertRaises(ValueError): await self.library.async_apply("bob", self.allowed, item["id"], self.apply)
        self.assertEqual(self.applied, [])

    async def test_permissions_rechecked_before_apply(self):
        item = await self.capture(entities=["light.a", "light.b"])
        denied = lambda entity, policy: entity != "light.b"
        with self.assertRaises(PermissionError): await self.library.async_apply("alice", denied, item["id"], self.apply)
        self.assertEqual(self.applied, [])

    async def test_capture_denies_read_only_entity(self):
        with self.assertRaises(PermissionError):
            await self.library.async_capture("alice", lambda e,p:p=="read", "Test", ["light.a"], "scene")
        self.assertIsNone(self.store.saved)

    async def test_list_filters_unreadable_snapshots(self):
        await self.capture(entities=["light.a", "light.b"])
        self.assertEqual(await self.library.async_list("alice", lambda e,p:e=="light.a"), [])

    async def test_partial_offline_snapshot_rejects_all(self):
        self.states["light.b"] = light(state="unavailable")
        with self.assertRaises(ValueError): await self.capture(entities=["light.a", "light.b"])
        self.assertIsNone(self.store.saved)

    async def test_offline_apply_dispatches_nothing(self):
        item = await self.capture(entities=["light.a", "light.b"])
        self.states["light.b"] = light(state="unavailable")
        with self.assertRaises(ValueError): await self.library.async_apply("alice", self.allowed, item["id"], self.apply)
        self.assertEqual(self.applied, [])

    async def test_save_failure_does_not_commit_memory(self):
        self.store.fail = True
        with self.assertRaises(OSError): await self.capture()
        self.assertEqual(self.library.items, {})

    async def test_delete_failure_retains_previous_snapshot(self):
        item = await self.capture()
        self.store.fail = True
        with self.assertRaises(OSError): await self.library.async_delete("alice", item["id"])
        self.assertIn(item["id"], self.library.items)

    async def test_invalid_targets_rejected(self):
        for ids in (["lock.front_door"], ["switch.alarm_bypass"], ["light.a", "light.a"], ["light.a"]*33):
            with self.assertRaises(ValueError): await self.capture(entities=ids)

    async def test_snapshot_tracks_live_state_at_capture(self):
        item = await self.capture()
        self.states["light.a"].attributes["brightness"] = 200
        await self.library.async_apply("alice", self.allowed, item["id"], self.apply)
        self.assertEqual(self.applied[0]["light.a"]["brightness"], 100)

    async def test_changed_capabilities_reject_before_dispatch(self):
        item = await self.capture()
        self.states["light.a"] = light(mode="onoff")
        with self.assertRaises(ValueError): await self.library.async_apply("alice", self.allowed, item["id"], self.apply)
        self.assertEqual(self.applied, [])

    async def test_new_group_membership_rejects_apply(self):
        item = await self.capture()
        self.states["light.a"].attributes["entity_id"] = ["light.secret"]
        with self.assertRaises(ValueError): await self.library.async_apply("alice", self.allowed, item["id"], self.apply)
        self.assertEqual(self.applied, [])

    async def test_no_partial_apply_when_native_service_raises(self):
        item = await self.capture()
        async def fail(_): raise OSError("native failure")
        with self.assertRaises(OSError): await self.library.async_apply("alice", self.allowed, item["id"], fail)
        self.assertIn(item["id"], self.library.items)

    async def test_delete_is_persistent(self):
        item = await self.capture()
        await self.library.async_delete("alice", item["id"])
        self.assertEqual(self.store.saved["items"], {})

    async def test_corrupt_archive_not_silently_reset(self):
        self.store.saved = {"schema_version": 99, "items": {}}
        with self.assertRaises(ValueError): await self.library.async_load()
        self.assertEqual(self.store.saved["schema_version"], 99)

    async def test_user_quota_survives_concurrent_requests(self):
        import asyncio
        for _ in range(63): await self.capture()
        results = await asyncio.gather(self.capture(), self.capture(), return_exceptions=True)
        self.assertEqual(sum(isinstance(r, ValueError) for r in results), 1)
        self.assertEqual(len(self.library.items), 64)

    async def test_empty_and_long_name_rejected(self):
        for name in (" ", "x"*65):
            with self.assertRaises(ValueError):
                await self.library.async_capture("alice", self.allowed, name, ["light.a"], "scene")
