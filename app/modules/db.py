from typing import Annotated
from fastapi import Depends
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from config import get_settings

engine = create_async_engine(get_settings().DB)

def get_session():
    with sessionmaker(bind=engine) as session:
        yield session

SessionDep = Annotated[AsyncSession, Depends(get_session)]