"""Branding module defaults."""

DEFAULT_CONFIG = {
    "schema_version": 1,
    "brand_name": "CL Control",
    "company_name": "CL Impianti",
    "product_name": "Home Control",
    "tagline": "Home & Building Control",
    "assets": {
        "logo": "/local/cl_control/logo.png",
        "logo_compact": "/local/cl_control/logo.png",
        "favicon": "/local/cl_control-brand/favicon.ico",
    },
    "colors": {
        "primary": "#19BAFF",
        "secondary": "#164C78",
        "accent": "#32E394",
        "background": "#061324",
        "surface": "#123852",
        "surface_alt": "#071D34",
        "text": "#F4F9FF",
        "muted": "#8FA9C5",
        "warning": "#FFD05C",
        "danger": "#FF5B69",
        "line": "rgba(140, 201, 255, 0.18)",
        "light_default_rgb": "255, 208, 92",
    },
    "typography": {
        "font_family": "Inter, system-ui, -apple-system, Segoe UI, sans-serif",
        "font_url": "",
    },
    "design_tokens": {
        "spacing": {"xs": "4px", "sm": "8px", "md": "12px", "lg": "16px", "xl": "24px", "xxl": "32px"},
        "radius": {"sm": "8px", "md": "12px", "lg": "18px", "xl": "24px", "pill": "999px"},
        "shadow": {
            "low": "0 4px 14px rgba(0, 0, 0, 0.12)",
            "medium": "0 12px 30px rgba(0, 0, 0, 0.18)",
            "high": "0 20px 48px rgba(0, 0, 0, 0.24)",
        },
        "icon_size": {"sm": "18px", "md": "22px", "lg": "28px"},
        "typography_scale": {"micro": "8px", "caption": "9px", "label": "10px", "body_small": "11px", "body": "12px", "heading": "15px", "title": "20px", "display": "30px"},
        "component_size": {"content_max_width": "1040px", "logo": "72px", "camera_height": "200px", "navigation_max_width": "960px", "navigation_item_width": "82px", "panel_bottom_space": "96px", "flow_node_min_height": "96px", "layout_min_column": "168px", "layout_editor_bar": "64px", "layout_preview_mobile": "390px", "layout_preview_tablet": "820px", "layout_preview_wall": "1200px"},
        "touch_target": "44px",
        "breakpoints": {"phone": 480, "tablet": 768, "desktop": 1200},
        "motion": {"fast": "120ms", "normal": "180ms", "slow": "280ms", "flow": "1.4s", "easing": "cubic-bezier(0.2, 0, 0, 1)"},
        "state": {"active": "#32E394", "disabled": "#71859A", "warning": "#FFD05C", "error": "#FF5B69"},
        "opacity": {"subtle": 0.08, "soft": 0.14, "medium": 0.35, "strong": 0.70},
    },
    "themes": [
        {
            "id": "cl_blue",
            "name": "CL Blue",
            "description": "Blu professionale",
            "mode": "dark",
            "colors": {},
        }
    ],
}
