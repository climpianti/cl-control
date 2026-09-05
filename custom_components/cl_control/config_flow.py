"""Config Flow and Options Flow for CL Control."""

from __future__ import annotations

import re
from typing import Any
from uuid import uuid4

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.config_entries import ConfigEntry, ConfigFlowResult
from homeassistant.core import callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.storage import Store
from homeassistant.helpers.selector import (
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)

from .const import (
    CONFIG_ENTRY_VERSION,
    CONF_ASSISTANCE_PROVIDER,
    CONF_BRANDING_TEMPLATE,
    CONF_CUSTOMER_NAME,
    CONF_EXPERIENCE_LEVEL,
    CONF_INSTALLATION_ID,
    CONF_RELEASE_CHANNEL,
    CONF_SITE_NAME,
    CONF_SUPPORT_PHONE,
    STORAGE_KEY,
    STORAGE_VERSION,
    DATA_CREDENTIALS,
    DOMAIN,
)
from .credentials import CredentialStore, async_verify_pin
from .entry_data import (
    ASSISTANCE_PROVIDERS,
    BRANDING_TEMPLATES,
    EXPERIENCE_LEVELS,
    RELEASE_CHANNELS,
    normalize_entry_options,
    options_from_legacy,
    sync_options_from_runtime,
)
from .models import migrate_runtime_config, normalize_settings

_PIN_PATTERN = re.compile(r"^[0-9]{4,12}$")
_CONF_PIN = "installer_pin"
_CONF_PIN_CONFIRM = "installer_pin_confirm"
_CONF_CURRENT_PIN = "current_installer_pin"
_CONF_NEW_PIN = "new_installer_pin"
_CONF_NEW_PIN_CONFIRM = "new_installer_pin_confirm"


def _valid_pin(value: Any) -> bool:
    return bool(_PIN_PATTERN.fullmatch(str(value or "")))


def _password_selector(autocomplete: str) -> TextSelector:
    """Return a masked PIN control with explicit browser autofill semantics."""
    return TextSelector(
        TextSelectorConfig(
            type=TextSelectorType.PASSWORD,
            autocomplete=autocomplete,
        )
    )


def _select_selector(
    options: tuple[str, ...], translation_key: str
) -> SelectSelector:
    """Return a compact localized dropdown for mobile-friendly flows."""
    return SelectSelector(
        SelectSelectorConfig(
            options=list(options),
            mode=SelectSelectorMode.DROPDOWN,
            translation_key=translation_key,
        )
    )


def _legacy_pin(raw: dict[str, Any], module: str) -> str:
    """Read a legacy PIN without ever copying it to public entry options."""
    if module == "installer":
        direct = raw.get("installer_pin")
        if direct is not None:
            return str(direct)
    section = raw.get(module)
    return str(section.get("pin") or "") if isinstance(section, dict) else ""


class CLControlConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Guide a new or imported CL Control installation."""

    VERSION = CONFIG_ENTRY_VERSION

    def __init__(self) -> None:
        self._options = normalize_entry_options({})
        self._installer_pin = ""
        self._discovery_counts = {"entities": 0, "devices": 0}

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> CLControlOptionsFlow:
        """Return the CL Control options handler."""
        return CLControlOptionsFlow()

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Collect site identity."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            self._options.update(user_input)
            return await self.async_step_assistance()
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_SITE_NAME,
                        default=self._options[CONF_SITE_NAME],
                    ): str,
                    vol.Optional(
                        CONF_CUSTOMER_NAME,
                        default=self._options[CONF_CUSTOMER_NAME],
                    ): str,
                }
            ),
        )

    async def async_step_assistance(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Collect non-secret support settings."""
        if user_input is not None:
            self._options.update(user_input)
            return await self.async_step_interface()
        return self.async_show_form(
            step_id="assistance",
            data_schema=vol.Schema(
                {
                    vol.Optional(
                        CONF_SUPPORT_PHONE,
                        default=self._options[CONF_SUPPORT_PHONE],
                    ): str,
                    vol.Required(
                        CONF_ASSISTANCE_PROVIDER,
                        default=self._options[CONF_ASSISTANCE_PROVIDER],
                    ): _select_selector(
                        ASSISTANCE_PROVIDERS, "assistance_provider"
                    ),
                }
            ),
        )

    async def async_step_interface(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Collect experience and branding choices."""
        if user_input is not None:
            self._options.update(user_input)
            return await self.async_step_installer()
        return self.async_show_form(
            step_id="interface",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_EXPERIENCE_LEVEL,
                        default=self._options[CONF_EXPERIENCE_LEVEL],
                    ): _select_selector(EXPERIENCE_LEVELS, "experience_level"),
                    vol.Required(
                        CONF_BRANDING_TEMPLATE,
                        default=self._options[CONF_BRANDING_TEMPLATE],
                    ): _select_selector(BRANDING_TEMPLATES, "branding_template"),
                }
            ),
        )

    async def async_step_installer(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Collect and confirm the backend-only Installer PIN."""
        errors: dict[str, str] = {}
        if user_input is not None:
            pin = str(user_input.get(_CONF_PIN) or "")
            confirmation = str(user_input.get(_CONF_PIN_CONFIRM) or "")
            if not _valid_pin(pin):
                errors["base"] = "invalid_pin_format"
            elif pin != confirmation:
                errors["base"] = "pin_mismatch"
            else:
                self._installer_pin = pin
                return await self.async_step_discovery()
        return self.async_show_form(
            step_id="installer",
            data_schema=vol.Schema(
                {
                    vol.Required(_CONF_PIN): _password_selector("new-password"),
                    vol.Required(_CONF_PIN_CONFIRM): _password_selector(
                        "new-password"
                    ),
                }
            ),
            errors=errors,
        )

    async def async_step_discovery(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Show a lightweight inventory without changing classifications."""
        if user_input is None:
            states = self.hass.states.async_all()
            devices = dr.async_get(self.hass).devices
            self._discovery_counts = {
                "entities": len(states),
                "devices": len(devices),
            }
            return self.async_show_form(
                step_id="discovery",
                data_schema=vol.Schema({}),
                description_placeholders={
                    key: str(value) for key, value in self._discovery_counts.items()
                },
            )
        return await self.async_step_summary()

    async def async_step_summary(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Confirm and create an installation with a random identity."""
        if user_input is None:
            return self.async_show_form(
                step_id="summary",
                data_schema=vol.Schema({}),
                description_placeholders={
                    "site_name": str(self._options[CONF_SITE_NAME]),
                    "experience_level": str(
                        self._options[CONF_EXPERIENCE_LEVEL]
                    ),
                    "entities": str(self._discovery_counts["entities"]),
                    "devices": str(self._discovery_counts["devices"]),
                },
            )
        installation_id = str(uuid4())
        await self.async_set_unique_id(installation_id)
        self._abort_if_unique_id_configured()
        await CredentialStore(self.hass).async_set_pin(
            installation_id, "installer_pin", self._installer_pin
        )
        self._installer_pin = ""
        options = normalize_entry_options(self._options)
        return self.async_create_entry(
            title=options[CONF_SITE_NAME],
            data={CONF_INSTALLATION_ID: installation_id},
            options=options,
        )

    async def async_step_import(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Import legacy YAML once while leaving source files untouched."""
        if self._async_current_entries():
            return self.async_abort(reason="already_configured")
        raw = user_input if isinstance(user_input, dict) else {}
        settings = normalize_settings(raw)
        installer_pin = _legacy_pin(raw, "installer")
        if not installer_pin:
            return self.async_abort(reason="legacy_pin_missing")

        installation_id = str(uuid4())
        await self.async_set_unique_id(installation_id)
        self._abort_if_unique_id_configured()
        credential_store = CredentialStore(self.hass)
        await credential_store.async_set_pin(
            installation_id, "installer_pin", installer_pin
        )
        security_pin = _legacy_pin(raw, "security")
        if security_pin:
            await credential_store.async_set_pin(
                installation_id, "security_pin", security_pin
            )
        options = options_from_legacy(raw)
        saved_runtime = await Store(
            self.hass, STORAGE_VERSION, STORAGE_KEY
        ).async_load()
        if isinstance(saved_runtime, dict):
            stored_options = sync_options_from_runtime(
                options, migrate_runtime_config(saved_runtime)
            )
            has_stored_site = isinstance(
                saved_runtime.get("site"), dict
            ) or isinstance(saved_runtime.get("support"), dict)
            stored_customer_ui = saved_runtime.get("customer_ui")
            has_stored_level = "experience_level" in saved_runtime or (
                isinstance(stored_customer_ui, dict)
                and "experience_level" in stored_customer_ui
            )
            if has_stored_site:
                for key in (
                    CONF_SITE_NAME,
                    CONF_CUSTOMER_NAME,
                    CONF_SUPPORT_PHONE,
                ):
                    options[key] = stored_options[key]
            if has_stored_level:
                options[CONF_EXPERIENCE_LEVEL] = stored_options[
                    CONF_EXPERIENCE_LEVEL
                ]
        ir.async_create_issue(
            self.hass,
            DOMAIN,
            "legacy_yaml_present",
            is_fixable=False,
            is_persistent=True,
            severity=ir.IssueSeverity.WARNING,
            translation_key="legacy_yaml_present",
        )
        return self.async_create_entry(
            title=str(settings["site"].get("site_name") or "CL Control"),
            data={CONF_INSTALLATION_ID: installation_id},
            options=options,
        )


class CLControlOptionsFlow(config_entries.OptionsFlowWithReload):
    """Edit mutable settings and rotate Installer credentials safely."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Separate ordinary settings from credential management."""
        return self.async_show_menu(
            step_id="init", menu_options=["general", "installer"]
        )

    async def async_step_general(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Manage mutable, non-sensitive installation options."""
        current = normalize_entry_options(self.config_entry.options)
        if user_input is not None:
            updated = normalize_entry_options({**current, **user_input})
            self.hass.config_entries.async_update_entry(
                self.config_entry, title=updated[CONF_SITE_NAME]
            )
            return self.async_create_entry(data=updated)
        schema = vol.Schema(
            {
                vol.Required(CONF_SITE_NAME): str,
                vol.Optional(CONF_CUSTOMER_NAME): str,
                vol.Optional(CONF_SUPPORT_PHONE): str,
                vol.Required(CONF_ASSISTANCE_PROVIDER): _select_selector(
                    ASSISTANCE_PROVIDERS, "assistance_provider"
                ),
                vol.Required(CONF_EXPERIENCE_LEVEL): _select_selector(
                    EXPERIENCE_LEVELS, "experience_level"
                ),
                vol.Required(CONF_BRANDING_TEMPLATE): _select_selector(
                    BRANDING_TEMPLATES, "branding_template"
                ),
                vol.Required(CONF_RELEASE_CHANNEL): _select_selector(
                    RELEASE_CHANNELS, "release_channel"
                ),
            }
        )
        return self.async_show_form(
            step_id="general",
            data_schema=self.add_suggested_values_to_schema(schema, current),
        )

    async def async_step_installer(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Rotate the Installer PIN without putting it in Config Entry data."""
        errors: dict[str, str] = {}
        if user_input is not None:
            current_pin = str(user_input.get(_CONF_CURRENT_PIN) or "")
            new_pin = str(user_input.get(_CONF_NEW_PIN) or "")
            confirmation = str(user_input.get(_CONF_NEW_PIN_CONFIRM) or "")
            installation_id = str(
                self.config_entry.data.get(CONF_INSTALLATION_ID) or ""
            )
            store = CredentialStore(self.hass)
            credentials = await store.async_get(installation_id)
            if not credentials or not await async_verify_pin(
                self.hass, current_pin, credentials.get("installer_pin")
            ):
                errors["base"] = "invalid_current_pin"
            elif not _valid_pin(new_pin):
                errors["base"] = "invalid_pin_format"
            elif new_pin != confirmation:
                errors["base"] = "pin_mismatch"
            else:
                record = await store.async_set_pin(
                    installation_id, "installer_pin", new_pin
                )
                domain_data = self.hass.data.get(DOMAIN, {})
                loaded = domain_data.get(DATA_CREDENTIALS)
                if isinstance(loaded, dict):
                    loaded["installer_pin"] = record
                return self.async_create_entry(
                    data=normalize_entry_options(self.config_entry.options)
                )
        return self.async_show_form(
            step_id="installer",
            data_schema=vol.Schema(
                {
                    vol.Required(_CONF_CURRENT_PIN): _password_selector(
                        "current-password"
                    ),
                    vol.Required(_CONF_NEW_PIN): _password_selector(
                        "new-password"
                    ),
                    vol.Required(_CONF_NEW_PIN_CONFIRM): _password_selector(
                        "new-password"
                    ),
                }
            ),
            errors=errors,
        )


__all__ = ("CLControlConfigFlow", "CLControlOptionsFlow")
