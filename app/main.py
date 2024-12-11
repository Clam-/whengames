from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware
from app.config import get_settings

import app.modules.auth as auth

app = FastAPI()
sessionsecret = get_settings().SESSION_SECRET_KEY
if not sessionsecret: raise ValueError("Require Session Secret set in config.")
app.add_middleware(SessionMiddleware, secret_key=sessionsecret)
#                   same_site=True, https_only=True, max_age=60*60*24*180)

app.include_router(auth.router)

@app.get("/")
async def root():
    return {"message": "Hello World"}
