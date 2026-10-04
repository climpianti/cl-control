"""CL ecosystem discovery for optional CL Impianti modules."""

from __future__ import annotations

from typing import Any

CL_MODULE_SPECS: dict[str, dict[str, Any]] = {
    "cl_power_control": {
        "module_id": "energy",
        "display_name": "CL Power Control",
        "customer_label": "Energia",
        "icon": "mdi:solar-power-variant",
        "strategy_type": "",
        "preferred_panel_paths": ("cl-power-control",),
        "customer_visible": True,
    },
    "cl_irrigation": {
        "module_id": "irrigation",
        "display_name": "CL Irrigation",
        "customer_label": "Irrigazione",
        "icon": "mdi:sprinkler-variant",
        "strategy_type": "cl-irrigation",
        "preferred_panel_paths": (),
        "customer_visible": True,
    },
}


def _clean_route(value: str | None) -> str:
    value = str(value or "").strip()
    if not value:
        return ""
    return value if value.startswith("/") else f"/{value}"


def build_module_descriptors(
    *,
    active_domains: set[str],
    entry_counts: dict[str, int] | None = None,
    panels: list[dict[str, Any]] | None = None,
    strategy_routes: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Build stable CL module descriptors from structural Home Assistant data."""
    entry_counts = entry_counts or {}
    panels = panels or []
    strategy_routes = strategy_routes or {}
    descriptors: list[dict[str, Any]] = []

    for domain, spec in CL_MODULE_SPECS.items():
        installed = domain in active_domains
        route = ""

        if installed:
            preferred = tuple(spec.get("preferred_panel_paths") or ())
            for panel in panels:
                path = str(panel.get("path") or "").strip("/")
                title = str(panel.get("title") or "").strip().casefold()
                if path in preferred or title == str(spec["display_name"]).casefold():
                    route = _clean_route(path)
                    break

            strategy_type = str(spec.get("strategy_type") or "")
            if not route and strategy_type:
                route = _clean_route(strategy_routes.get(strategy_type))

        ready = bool(installed and route)
        descriptors.append(
            {
                "domain": domain,
                "module_id": str(spec["module_id"]),
                "display_name": str(spec["display_name"]),
                "customer_label": str(spec["customer_label"]),
                "icon": str(spec["icon"]),
                "strategy_type": str(spec.get("strategy_type") or ""),
                "installed": installed,
                "available": installed,
                "ready": ready,
                "route": route,
                "entry_count": int(entry_counts.get(domain, 0)),
                "customer_visible": bool(spec.get("customer_visible", True) and ready),
                "status": (
                    "ready"
                    if ready
                    else "dashboard_required"
                    if installed
                    else "not_installed"
                ),
            }
        )

    return descriptors


def module_signature(modules: list[dict[str, Any]]) -> tuple[tuple[Any, ...], ...]:
    """Return a compact structural signature used by the dashboard cache."""
    return tuple(
        (
            item.get("domain"),
            bool(item.get("installed")),
            bool(item.get("ready")),
            item.get("route") or "",
            int(item.get("entry_count") or 0),
        )
        for item in modules
    )


def resolve_energy_provider(
    requested: str | None,
    modules: list[dict[str, Any]],
    *,
    home_assistant_energy_available: bool,
) -> str:
    """Resolve the configured energy provider without reading entity states."""
    requested = str(requested or "auto").strip().lower()
    if requested not in {"auto", "cl_power_control", "home_assistant", "none"}:
        requested = "auto"

    cl_power_available = any(
        item.get("domain") == "cl_power_control" and item.get("available")
        for item in modules
    )

    if requested == "none":
        return "none"
    if requested == "cl_power_control":
        return "cl_power_control" if cl_power_available else "none"
    if requested == "home_assistant":
        return "home_assistant" if home_assistant_energy_available else "none"
    if cl_power_available:
        return "cl_power_control"
    if home_assistant_energy_available:
        return "home_assistant"
    return "none"


async def async_discover_cl_modules(hass: Any) -> list[dict[str, Any]]:
    """Discover CL modules from Config Entries and existing Lovelace dashboards."""
    from homeassistant.components import frontend
    from homeassistant.components.lovelace.const import LOVELACE_DATA

    active_domains: set[str] = set()
    entry_counts: dict[str, int] = {}

    for domain in CL_MODULE_SPECS:
        entries = hass.config_entries.async_entries(domain)
        active = [
            entry
            for entry in entries
            if getattr(entry, "disabled_by", None) is None
            and str(getattr(entry, "source", "")) != "ignore"
        ]
        if active:
            active_domains.add(domain)
            entry_counts[domain] = len(active)

    panels = [
        {
            "path": str(path),
            "title": str(getattr(panel, "sidebar_title", "") or ""),
        }
        for path, panel in hass.data.get(frontend.DATA_PANELS, {}).items()
    ]

    strategy_routes: dict[str, str] = {}
    lovelace_data = hass.data.get(LOVELACE_DATA)
    dashboards = (
        getattr(lovelace_data, "dashboards", None)
        if lovelace_data is not None
        else None
    )
    if dashboards is None and isinstance(lovelace_data, dict):
        dashboards = lovelace_data.get("dashboards")

    if isinstance(dashboards, dict):
        known_strategies = {
            str(spec.get("strategy_type") or "")
            for spec in CL_MODULE_SPECS.values()
            if spec.get("strategy_type")
        }
        for url_path, dashboard in dashboards.items():
            if not url_path or not hasattr(dashboard, "async_load"):
                continue
            try:
                config = await dashboard.async_load(False)
            except Exception:  # A dashboard may exist without stored config yet.
                continue
            strategy = config.get("strategy") if isinstance(config, dict) else None
            strategy_type = (
                str(strategy.get("type") or "")
                if isinstance(strategy, dict)
                else ""
            )
            if strategy_type in known_strategies and strategy_type not in strategy_routes:
                strategy_routes[strategy_type] = str(url_path)

    return build_module_descriptors(
        active_domains=active_domains,
        entry_counts=entry_counts,
        panels=panels,
        strategy_routes=strategy_routes,
    )


__all__ = (
    "CL_MODULE_SPECS",
    "async_discover_cl_modules",
    "build_module_descriptors",
    "module_signature",
    "resolve_energy_provider",
)
