from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "EarthScope AI Backend"}


def test_cors_allows_nextjs_dev_server() -> None:
    response = client.get("/api/health", headers={"Origin": "http://localhost:3000"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_variables_lists_t2m_with_units_and_description() -> None:
    response = client.get("/api/variables")
    assert response.status_code == 200
    variables = {v["id"]: v for v in response.json()}
    assert set(variables) == {"T2M"}
    t2m = variables["T2M"]
    assert t2m["unit"] == "C"
    assert t2m["trend_unit"] == "C/decade"
    assert t2m["coverage_start_year"] == 1981
    assert "2 meters" in t2m["description"]
