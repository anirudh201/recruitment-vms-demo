
def test_super_admin_can_create_client(api_client, test_context, auth_headers):
    response = api_client.post(
        "/clients/",
        headers=auth_headers(test_context["admin"]),
        json={
            "company_name": "Automated Test Client",
            "address": "Hyderabad, Telangana",
            "notes": "Created by an isolated API test",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["company_name"] == "Automated Test Client"
    assert data["organization_id"] == test_context["organization"].id
    assert data["contacts"] == []

def test_duplicate_client_name_is_rejected(
    api_client, test_context, auth_headers
):
    headers = auth_headers(test_context["admin"])
    payload = {
        "company_name": "Duplicate Test Client",
    }

    first_response = api_client.post(
        "/clients/",
        headers=headers,
        json=payload,
    )
    second_response = api_client.post(
        "/clients/",
        headers=headers,
        json=payload,
    )

    assert first_response.status_code == 201
    assert second_response.status_code == 409
    assert second_response.json()["detail"] == (
        "A client with this company name already exists"
    )

def test_recruiter_cannot_create_client(
    api_client, test_context, auth_headers
):
    response = api_client.post(
        "/clients/",
        headers=auth_headers(test_context["recruiter"]),
        json={"company_name": "Recruiter Restricted Client"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == (
        "You do not have permission to perform this action"
    )

def test_vendor_cannot_create_client(
    api_client, test_context, auth_headers
):
    response = api_client.post(
        "/clients/",
        headers=auth_headers(test_context["vendor"]),
        json={"company_name": "Vendor Restricted Client"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == (
        "You do not have permission to perform this action"
    )

def test_client_is_not_visible_to_another_organization(
    api_client, test_context, auth_headers
):
    create_response = api_client.post(
        "/clients/",
        headers=auth_headers(test_context["admin"]),
        json={"company_name": "Private Organization Client"},
    )
    assert create_response.status_code == 201

    client_id = create_response.json()["id"]

    other_response = api_client.get(
        f"/clients/{client_id}",
        headers=auth_headers(test_context["other_admin"]),
    )

    assert other_response.status_code == 404
    assert other_response.json()["detail"] == "Client not found"

def test_super_admin_can_update_client(
    api_client, test_context, auth_headers
):
    headers = auth_headers(test_context["admin"])

    create_response = api_client.post(
        "/clients/",
        headers=headers,
        json={"company_name": "Client Before Update"},
    )
    assert create_response.status_code == 201

    client_id = create_response.json()["id"]

    update_response = api_client.patch(
        f"/clients/{client_id}",
        headers=headers,
        json={
            "company_name": "Client After Update",
            "notes": "Updated by automated test",
        },
    )

    assert update_response.status_code == 200
    data = update_response.json()
    assert data["company_name"] == "Client After Update"
    assert data["notes"] == "Updated by automated test"

def test_super_admin_can_add_client_contact(
    api_client, test_context, auth_headers
):
    headers = auth_headers(test_context["admin"])

    create_response = api_client.post(
        "/clients/",
        headers=headers,
        json={"company_name": "Contact Test Client"},
    )
    assert create_response.status_code == 201

    client_id = create_response.json()["id"]

    contact_response = api_client.post(
        f"/clients/{client_id}/contacts",
        headers=headers,
        json={
            "contact_type": "HR",
            "name": "Test HR Contact",
            "email": "hr.contact@example.com",
            "phone": "9000000010",
            "is_primary": True,
        },
    )

    assert contact_response.status_code == 201
    data = contact_response.json()
    assert data["name"] == "Test HR Contact"
    assert data["email"] == "hr.contact@example.com"
    assert data["contact_type"] == "HR"
    assert data["is_primary"] is True

def test_super_admin_can_update_client_contact(
    api_client, test_context, auth_headers
):
    headers = auth_headers(test_context["admin"])

    create_response = api_client.post(
        "/clients/",
        headers=headers,
        json={"company_name": "Contact Update Test Client"},
    )
    assert create_response.status_code == 201

    client_id = create_response.json()["id"]

    contact_response = api_client.post(
        f"/clients/{client_id}/contacts",
        headers=headers,
        json={
            "contact_type": "FINANCE",
            "name": "Finance Contact Before Update",
            "email": "finance.test@example.com",
            "phone": "9000000011",
            "is_primary": False,
        },
    )
    assert contact_response.status_code == 201

    contact_id = contact_response.json()["id"]

    update_response = api_client.patch(
        f"/clients/{client_id}/contacts/{contact_id}",
        headers=headers,
        json={
            "name": "Finance Contact After Update",
            "phone": "9000000012",
        },
    )

    assert update_response.status_code == 200
    data = update_response.json()
    assert data["name"] == "Finance Contact After Update"
    assert data["phone"] == "9000000012"
    assert data["email"] == "finance.test@example.com"
    assert data["contact_type"] == "FINANCE"

def test_updating_contact_with_null_contact_type_returns_422(
    api_client, test_context, auth_headers
):
    headers = auth_headers(test_context["admin"])

    client_response = api_client.post(
        "/clients/",
        headers=headers,
        json={"company_name": "Null Contact Type Test Client"},
    )
    assert client_response.status_code == 201
    client_id = client_response.json()["id"]

    contact_response = api_client.post(
        f"/clients/{client_id}/contacts",
        headers=headers,
        json={
            "contact_type": "HR",
            "name": "Test HR Contact",
        },
    )
    assert contact_response.status_code == 201
    contact_id = contact_response.json()["id"]

    update_response = api_client.patch(
        f"/clients/{client_id}/contacts/{contact_id}",
        headers=headers,
        json={"contact_type": None},
    )

    assert update_response.status_code == 422
