"""Loopback-only fixture server exercising the production stable loader."""
from aiohttp import web
from test_distribution import distribution, PACKAGE, ROOT

view = distribution.DashboardStrategyView("3.4.2-beta.1")

async def install_fixture(request):
    version = request.match_info["version"]
    if version not in ("3.4.2-beta.1", "3.4.3-beta.1"):
        raise web.HTTPBadRequest()
    view.version = version
    return web.Response(text=version)

app = web.Application()
app.router.add_get(distribution.STRATEGY_URL, view.get)
app.router.add_post("/_test/install/{version}", install_fixture)
for version in ("3.4.2-beta.1", "3.4.3-beta.1"):
    app.router.add_static(distribution.static_url(version), PACKAGE / "frontend")
app.router.add_static("/", ROOT)
if __name__ == "__main__":
    web.run_app(app, host="127.0.0.1", port=8765, print=None)
