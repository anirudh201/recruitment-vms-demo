
def create_client(api_client, headers, company_name="Test Client"):
    response = api_client.post(
        "/clients/",
        headers=headers,
        json={"company_name": company_name},
    )
    assert response.status_code == 201, response.text
    return response.json()


def create_job(api_client, headers, client_id=None):
    payload = {
        "title": "Python Developer",
        "description": "Build and maintain backend services.",
        "location": "Hyderabad",
    }

    if client_id is not None:
        payload["client_id"] = client_id

    return api_client.post(
        "/jobs",
        headers=headers,
        json=payload,
    )


def test_create_job_with_same_organization_client(
    api_client, test_context, auth_headers
):
    headers = auth_headers(test_context["admin"])
    client = create_client(api_client, headers)

    response = create_job(api_client, headers, client["id"])

    assert response.status_code == 201, response.text
    assert response.json()["client_id"] == client["id"]


def test_create_job_rejects_other_organizations_client(
    api_client, test_context, auth_headers
):
    admin_headers = auth_headers(test_context["admin"])
    other_headers = auth_headers(test_context["other_admin"])

    client = create_client(
        api_client,
        other_headers,
        company_name="Other Organization Client",
    )

    response = create_job(api_client, admin_headers, client["id"])

    assert response.status_code == 422
    assert response.json()["detail"] == "Client not found in your organization"


def test_create_job_rejects_nonexistent_client(
    api_client, test_context, auth_headers
):
    headers = auth_headers(test_context["admin"])

    response = create_job(api_client, headers, 999999)

    assert response.status_code == 422
    assert response.json()["detail"] == "Client not found in your organization"


def test_update_job_rejects_other_organizations_client(
    api_client, test_context, auth_headers
):
    admin_headers = auth_headers(test_context["admin"])
    other_headers = auth_headers(test_context["other_admin"])

    job_response = create_job(api_client, admin_headers)
    assert job_response.status_code == 201, job_response.text
    job_id = job_response.json()["id"]

    other_client = create_client(
        api_client,
        other_headers,
        company_name="Foreign Client",
    )

    response = api_client.patch(
        f"/jobs/{job_id}",
        headers=admin_headers,
        json={"client_id": other_client["id"]},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Client not found in your organization"


def test_update_job_can_unlink_client(
    api_client, test_context, auth_headers
):
    headers = auth_headers(test_context["admin"])
    client = create_client(api_client, headers)

    job_response = create_job(api_client, headers, client["id"])
    assert job_response.status_code == 201, job_response.text
    job_id = job_response.json()["id"]

    response = api_client.patch(
        f"/jobs/{job_id}",
        headers=headers,
        json={"client_id": None},
    )

    assert response.status_code == 200, response.text
    assert response.json()["client_id"] is None
