from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_patient_intake_simulation():
    response = client.post(
        "/api/patient/intake",
        json={
            "vas_score": 7,
            "preferences": ["calm", "piano"],
            "conversation_text": "요즘 너무 불안하고 잠을 잘 못 자요."
        }
    )
    assert response.status_code == 200