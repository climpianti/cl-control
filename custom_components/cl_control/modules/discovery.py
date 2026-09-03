"""Discovery module defaults."""

DEFAULT_CONFIG = {
    "schema_version": 1,
    "enabled": True,
    "domains": [
        "light",
        "switch",
        "valve",
        "cover",
        "climate",
        "sensor",
        "binary_sensor",
        "camera",
        "alarm_control_panel",
        "select",
    ],
    "ignore_unavailable": False,
    "classification_confidence_threshold": 0.75,
    "experience_rules": {
        "essential_domains": [
            "light",
            "switch",
            "valve",
            "cover",
            "alarm_control_panel",
        ],
        "standard_domains": ["climate", "camera"],
        "pro_domains": ["sensor", "binary_sensor", "select"],
        "installer_patterns": [
            "^update\\.",
            "^sensor\\..*(cpu|memory|version|diagnostic)",
            "^binary_sensor\\..*_in_esecuzione$",
        ],
    },
}


def classify_entity(
    entity_id: str,
    attributes: dict | None = None,
    config: dict | None = None,
) -> dict:
    """Classify an entity with confidence and an auditable reason."""
    import re

    attributes = attributes or {}
    config = config or DEFAULT_CONFIG
    rules = config.get("experience_rules", DEFAULT_CONFIG["experience_rules"])
    text = f"{entity_id} {attributes.get('friendly_name', '')}".lower()
    threshold = float(config.get("classification_confidence_threshold", 0.75))
    if any(re.search(pattern, text) for pattern in rules.get("installer_patterns", [])):
        level, confidence, reason = "installer", 0.98, "installer_pattern"
    else:
        domain = entity_id.split(".", 1)[0]
        if domain in rules.get("essential_domains", []):
            level, confidence, reason = "essential", 0.92, "essential_domain"
        elif domain in rules.get("standard_domains", []):
            level, confidence, reason = "standard", 0.88, "standard_domain"
        elif domain in rules.get("pro_domains", []):
            level, confidence, reason = "pro", 0.65, "broad_technical_domain"
        else:
            level, confidence, reason = "standard", 0.40, "fallback"
    return {
        "recommended_level": level,
        "classification_confidence": confidence,
        "classification_reason": reason,
        "needs_review": confidence < threshold,
    }


def recommend_experience_level(
    entity_id: str,
    attributes: dict | None = None,
    config: dict | None = None,
) -> str:
    """Compatibility wrapper returning only the recommended level."""
    return classify_entity(entity_id, attributes, config)["recommended_level"]
