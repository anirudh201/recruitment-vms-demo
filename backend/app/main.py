
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import router as auth_router
from app.users import router as users_router
from app.jobs import router as jobs_router
from app.vendors import router as vendors_router
from app.clients import router as clients_router
from app.candidates import router as candidates_router
from app.recruiters import router as recruiters_router

app = FastAPI(
    title="Recruitment VMS API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(jobs_router)
app.include_router(vendors_router)
app.include_router(clients_router)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "application": "Recruitment VMS",
    }
app.include_router(candidates_router)
app.include_router(recruiters_router)
