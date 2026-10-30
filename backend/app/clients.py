
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field,field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db_dependencies import get_db
from app.dependencies import require_any_permission, require_permission
from app.models import Client, ClientContact, User


router = APIRouter(prefix="/clients", tags=["Client Management"])


ContactType = Literal["HR", "FINANCE", "OTHER"]


class ClientContactCreate(BaseModel):
    contact_type: ContactType
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=30)
    is_primary: bool = False



class ClientContactUpdate(BaseModel):
    contact_type: ContactType | None = None
    name: str | None = Field(default=None, min_length=1, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=30)
    is_primary: bool | None = None

    @field_validator("contact_type")
    @classmethod
    def contact_type_cannot_be_null_when_provided(cls, value):
        if value is None:
            raise ValueError("contact_type cannot be null")
        return value


class ClientCreate(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    address: str | None = None
    notes: str | None = None
    contacts: list[ClientContactCreate] = Field(default_factory=list)


class ClientUpdate(BaseModel):
    company_name: str | None = Field(default=None, min_length=1, max_length=200)
    address: str | None = None
    notes: str | None = None
    is_active: bool | None = None

class ClientContactResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    contact_type: str
    name: str
    email: str | None
    phone: str | None
    is_primary: bool
    created_at: datetime


class ClientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    organization_id: int
    company_name: str
    address: str | None
    notes: str | None
    is_active: bool
    created_at: datetime
    contacts: list[ClientContactResponse] = Field(default_factory=list)


def get_client_for_organization(
    db: Session, client_id: int, organization_id: int
) -> Client:
    client = db.scalar(
        select(Client).where(
            Client.id == client_id,
            Client.organization_id == organization_id,
        )
    )
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found",
        )
    return client


@router.post(
    "",
    response_model=ClientResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_client(
    payload: ClientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("clients.manage")),
):
    company_name = payload.company_name.strip()
    if not company_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Client company name cannot be empty",
        )

    duplicate = db.scalar(
        select(Client).where(
            Client.organization_id == current_user.organization_id,
            Client.company_name == company_name,
        )
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A client with this company name already exists",
        )

    primary_contacts = sum(1 for contact in payload.contacts if contact.is_primary)
    if primary_contacts > 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only one contact can be marked primary per client",
        )

    client = Client(
        organization_id=current_user.organization_id,
        company_name=company_name,
        address=payload.address,
        notes=payload.notes,
        is_active=True,
    )

    for contact_data in payload.contacts:
        contact_name = contact_data.name.strip()
        if not contact_name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Contact name cannot be empty",
            )
        client.contacts.append(
            ClientContact(
                contact_type=contact_data.contact_type,
                name=contact_name,
                email=str(contact_data.email) if contact_data.email else None,
                phone=contact_data.phone,
                is_primary=contact_data.is_primary,
            )
        )

    db.add(client)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(client)
    return client


@router.get("", response_model=list[ClientResponse])
def list_clients(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_permission("clients.manage", "clients.view")),
):
    return db.scalars(
        select(Client)
        .where(Client.organization_id == current_user.organization_id)
        .order_by(Client.id)
    ).all()


@router.get("/{client_id}", response_model=ClientResponse)
def get_client(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_permission("clients.manage", "clients.view")),
):
    return get_client_for_organization(
        db, client_id, current_user.organization_id
    )

@router.patch("/{client_id}", response_model=ClientResponse)
def update_client(
    client_id: int,
    payload: ClientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("clients.manage")),
):
    client = get_client_for_organization(
        db, client_id, current_user.organization_id
    )

    changes = payload.model_dump(exclude_unset=True)

    if not changes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide at least one field to update",
        )

    if "company_name" in changes:
        company_name = changes["company_name"]
        if company_name is None or not company_name.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Client company name cannot be empty",
            )

        company_name = company_name.strip()

        duplicate = db.scalar(
            select(Client).where(
                Client.organization_id == current_user.organization_id,
                Client.company_name == company_name,
                Client.id != client_id,
            )
        )
        if duplicate is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A client with this company name already exists",
            )

        changes["company_name"] = company_name

    for field, value in changes.items():
        setattr(client, field, value)

    db.commit()
    db.refresh(client)
    return client

@router.post(
    "/{client_id}/contacts",
    response_model=ClientContactResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_client_contact(
    client_id: int,
    payload: ClientContactCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("clients.manage")),
):
    client = get_client_for_organization(
        db, client_id, current_user.organization_id
    )

    contact_name = payload.name.strip()
    if not contact_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Contact name cannot be empty",
        )

    if payload.is_primary:
        for contact in client.contacts:
            contact.is_primary = False

    contact = ClientContact(
        client_id=client.id,
        contact_type=payload.contact_type,
        name=contact_name,
        email=str(payload.email) if payload.email else None,
        phone=payload.phone,
        is_primary=payload.is_primary,
    )

    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


@router.patch(
    "/{client_id}/contacts/{contact_id}",
    response_model=ClientContactResponse,
)
def update_client_contact(
    client_id: int,
    contact_id: int,
    payload: ClientContactUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("clients.manage")),
):
    client = get_client_for_organization(
        db, client_id, current_user.organization_id
    )

    contact = db.scalar(
        select(ClientContact).where(
            ClientContact.id == contact_id,
            ClientContact.client_id == client.id,
        )
    )

    if contact is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found",
        )

    changes = payload.model_dump(exclude_unset=True)

    if not changes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide at least one field to update",
        )

    if "name" in changes:
        if changes["name"] is None or not changes["name"].strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Contact name cannot be empty",
            )
        changes["name"] = changes["name"].strip()

    if "email" in changes:
        changes["email"] = (
            str(changes["email"]) if changes["email"] else None
        )

    if changes.get("is_primary") is True:
        for other_contact in client.contacts:
            if other_contact.id != contact.id:
                other_contact.is_primary = False

    for field, value in changes.items():
        setattr(contact, field, value)

    db.commit()
    db.refresh(contact)
    return contact
