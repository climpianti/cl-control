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

    def test_malformed_client_values_return_validation_errors(self):
        for value in ({"state": []}, {"state": "on", "color_mode": []}, {"state": "on", "brightness": True}):
            with self.assertRaises(ValueError): validate_snapshot(value)


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

    async def test_create_explicit_draft_does_not_capture_or_actuate(self):
        self.states["light.a"] = light(state="off", mode="brightness", color_mode=None, brightness=None)
        draft = {"light.a": {"state": "on", "color_mode": "brightness", "brightness": 133}, "light.b": {"state": "off"}}
        item = await self.library.async_create_scene("alice", self.allowed, " Relax ", draft)
        draft["light.a"]["brightness"] = 255
        self.assertEqual(item["states"]["light.a"]["brightness"], 133)
        self.assertEqual(item["name"], "Relax")
        self.assertEqual(self.states["light.a"].state, "off")
        self.assertEqual(self.applied, [])
        await self.library.async_apply("alice", self.allowed, item["id"], self.apply)
        self.assertEqual(self.applied[0]["light.a"]["brightness"], 133)

    async def test_explicit_scene_reloads_with_legacy_snapshot(self):
        legacy = await self.capture("preset")
        created = await self.library.async_create_scene("alice", self.allowed, "Off", {"light.b": {"state": "off"}})
        restarted = LightMemoryLibrary(self.store, self.states.get)
        await restarted.async_load()
        listed = await restarted.async_list("alice", self.allowed)
        self.assertEqual({i["id"] for i in listed}, {legacy["id"], created["id"]})
        self.assertEqual(self.store.saved["schema_version"], 1)

    async def test_explicit_scene_checks_permissions_and_availability(self):
        for denied in (lambda e,p:p=="read", lambda e,p:e!="light.b"):
            with self.assertRaises(PermissionError):
                await self.library.async_create_scene("alice", denied, "Test", {"light.b": {"state": "off"}})
        self.states["light.b"] = light(state="unavailable")
        with self.assertRaises(ValueError):
            await self.library.async_create_scene("alice", self.allowed, "Test", {"light.b": {"state": "off"}})
        self.assertIsNone(self.store.saved)

    async def test_explicit_scene_rejects_unsupported_controls(self):
        self.states["light.b"] = light(mode="onoff")
        for target in ({"state": "on", "brightness": 100}, {"state": "on", "color_mode": "rgb", "rgb_color": [1,2,3]}):
            with self.assertRaises(ValueError):
                await self.library.async_create_scene("alice", self.allowed, "Test", {"light.b": target})
        self.assertIsNone(self.store.saved)

    async def test_explicit_scene_validates_color_and_white_channels(self):
        self.states["light.a"] = light(mode="rgbww")
        target = {"state": "on", "brightness": 120, "color_mode": "rgbww", "rgbww_color": [12,34,56,78,90]}
        item = await self.library.async_create_scene("alice", self.allowed, "Color", {"light.a": target})
        self.assertEqual(item["states"]["light.a"], target)
        target["rgbww_color"][4] = 300
        with self.assertRaises(ValueError):
            await self.library.async_create_scene("alice", self.allowed, "Bad", {"light.a": target})

    async def test_explicit_scene_checks_device_kelvin_and_effect(self):
        self.states["light.a"] = light(mode="color_temp", min_color_temp_kelvin=2200, max_color_temp_kelvin=6000, effect_list=["Relax"])
        for target in ({"state": "on", "color_mode": "color_temp", "color_temp_kelvin": 6500}, {"state": "on", "effect": "Unknown"}):
            with self.assertRaises(ValueError):
                await self.library.async_create_scene("alice", self.allowed, "Test", {"light.a": target})
        item = await self.library.async_create_scene("alice", self.allowed, "Warm", {"light.a": {"state": "on", "color_mode": "color_temp", "color_temp_kelvin": 2700}})
        self.assertEqual(item["states"]["light.a"]["color_temp_kelvin"], 2700)

    async def test_explicit_scene_rejects_unknown_fields_and_non_lights(self):
        for states in ({"light.a": {"state": "on", "service": "unlock"}}, {"lock.front": {"state": "off"}}, {1: {"state": "off"}}, {}, {"light.a": {"state": "off", "brightness": 1}}):
            with self.assertRaises(ValueError):
                await self.library.async_create_scene("alice", self.allowed, "Test", states)
        self.states["light.b"] = light(entity_id=["light.secret"])
        with self.assertRaises(ValueError):
            await self.library.async_create_scene("alice", self.allowed, "Test", {"light.b": {"state": "off"}})
        self.assertIsNone(self.store.saved)

    async def test_explicit_save_failure_keeps_existing_library(self):
        previous = await self.capture()
        self.store.fail = True
        with self.assertRaises(OSError):
            await self.library.async_create_scene("alice", self.allowed, "Test", {"light.a": {"state": "off"}})
        self.assertEqual(list(self.library.items), [previous["id"]])

    async def test_explicit_scene_is_owner_scoped(self):
        item = await self.library.async_create_scene("alice", self.allowed, "Test", {"light.a": {"state": "off"}})
        self.assertNotIn("owner", item)
        self.assertEqual(await self.library.async_list("bob", self.allowed), [])
        with self.assertRaises(ValueError):
            await self.library.async_apply("bob", self.allowed, item["id"], self.apply)

    async def test_explicit_scene_shares_quota_with_existing_presets(self):
        import asyncio
        for _ in range(63): await self.capture("preset")
        async def create():
            return await self.library.async_create_scene("alice", self.allowed, "Test", {"light.a": {"state": "off"}})
        results = await asyncio.gather(create(), create(), return_exceptions=True)
        self.assertEqual(sum(isinstance(result, ValueError) for result in results), 1)
        self.assertEqual(len(self.library.items), 64)

    async def test_explicit_scene_invalid_name_and_target_limit(self):
        for name in (" ", "x"*65):
            with self.assertRaises(ValueError):
                await self.library.async_create_scene("alice", self.allowed, name, {"light.a": {"state": "off"}})
        with self.assertRaises(ValueError):
            await self.library.async_create_scene("alice", self.allowed, "Test", {f"light.test_{i}": {"state": "off"} for i in range(33)})
        self.assertIsNone(self.store.saved)

    async def editable(self):
        item = await self.capture(entities=["light.a", "light.b"])
        listed = await self.library.async_list("alice", self.allowed)
        return item, next(i["revision"] for i in listed if i["id"] == item["id"])

    async def test_update_keeps_identity_and_persists_without_commands(self):
        item, revision = await self.editable()
        self.states["light.c"] = light(mode="brightness", state="off")
        target = {"light.c": {"state": "on", "brightness": 133, "color_mode": "brightness"}}
        updated = await self.library.async_update_scene("alice", self.allowed, item["id"], " Nuovo nome ", target, revision)
        self.assertEqual(updated["id"], item["id"])
        self.assertEqual(updated["created_at"], item["created_at"])
        self.assertEqual(updated["name"], "Nuovo nome")
        self.assertNotEqual(updated["revision"], revision)
        self.assertEqual(len(self.library.items), 1)
        self.assertEqual(self.applied, [])
        self.assertEqual(self.states["light.c"].state, "off")
        restarted = LightMemoryLibrary(self.store, self.states.get)
        await restarted.async_load()
        self.assertEqual((await restarted.async_list("alice", self.allowed))[0]["states"], target)

    async def test_update_is_owner_scoped_and_checks_control_permission(self):
        item, revision = await self.editable()
        with self.assertRaises(ValueError):
            await self.library.async_update_scene("bob", self.allowed, item["id"], "Test", {"light.a": {"state": "off"}}, revision)
        with self.assertRaises(PermissionError):
            await self.library.async_update_scene("alice", lambda e,p:p=="read", item["id"], "Test", {"light.a": {"state": "off"}}, revision)
        self.assertEqual(self.library.items[item["id"]]["states"], item["states"])

    async def test_update_can_remove_offline_targets_but_not_retain_them(self):
        item, revision = await self.editable()
        self.states["light.b"] = light(state="unavailable")
        with self.assertRaises(ValueError):
            await self.library.async_update_scene("alice", self.allowed, item["id"], "Test", item["states"], revision)
        updated = await self.library.async_update_scene("alice", self.allowed, item["id"], "Test", {"light.a": {"state": "off"}}, revision)
        self.assertNotIn("light.b", updated["states"])

    async def test_update_failure_and_conflict_keep_previous_data(self):
        item, revision = await self.editable()
        self.store.fail = True
        with self.assertRaises(OSError):
            await self.library.async_update_scene("alice", self.allowed, item["id"], "Test", {"light.a": {"state": "off"}}, revision)
        self.assertEqual(self.library.items[item["id"]]["name"], item["name"])
        self.store.fail = False
        await self.library.async_update_scene("alice", self.allowed, item["id"], "Primo", {"light.a": {"state": "off"}}, revision)
        with self.assertRaisesRegex(ValueError, "modificato altrove"):
            await self.library.async_update_scene("alice", self.allowed, item["id"], "Secondo", item["states"], revision)
        self.assertEqual(self.library.items[item["id"]]["name"], "Primo")

    async def test_update_allowed_at_quota_and_presets_unchanged(self):
        item, revision = await self.editable()
        for _ in range(63): await self.capture("preset")
        await self.library.async_update_scene("alice", self.allowed, item["id"], "Updated", {"light.a": {"state": "off"}}, revision)
        self.assertEqual(len(self.library.items), 64)
        preset = next(i for i in self.library.items.values() if i["kind"] == "preset")
        with self.assertRaises(ValueError):
            await self.library.async_update_scene("alice", self.allowed, preset["id"], "Test", preset["states"], self.library._revision(preset))

    async def test_update_rejects_unsupported_and_malformed_targets(self):
        item, revision = await self.editable()
        self.states["light.c"] = light(mode="onoff")
        for states in ({}, {"lock.front": {"state": "off"}}, {"light.a": {"state": "off", "brightness": 100}}, {"light.c": {"state": "on", "brightness": 100}}):
            with self.assertRaises(ValueError):
                await self.library.async_update_scene("alice", self.allowed, item["id"], "Test", states, revision)
        self.assertEqual(self.library.items[item["id"]]["states"], item["states"])
