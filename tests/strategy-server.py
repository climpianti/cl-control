"""Loopback-only fixture server exercising the production stable loader."""
from aiohttp import web
from test_distribution import distribution, PACKAGE, ROOT

view = distribution.DashboardStrategyView("3.5.0-dev")

async def install_fixture(request):
    version = request.match_info["version"]
    if version not in ("3.5.0-dev", "3.5.1-dev"):
        raise web.HTTPBadRequest()
    view.version = version
    return web.Response(text=version)

app = web.Application()
app.router.add_get(distribution.STRATEGY_URL, view.get)
app.router.add_post("/_test/install/{version}", install_fixture)
for version in ("3.5.0-dev", "3.5.1-dev"):
    app.router.add_static(distribution.static_url(version), PACKAGE / "frontend")
app.router.add_static("/", ROOT)
if __name__ == "__main__":
    web.run_app(app, host="127.0.0.1", port=8765, print=None)
