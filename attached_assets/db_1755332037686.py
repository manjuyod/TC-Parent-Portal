from sqlalchemy import create_engine
from urllib.parse import quote_plus
import os

def get_database_url():
    server = os.environ.get("CRMSRV_ADDRESS", "localhost")
    database = os.environ.get("CRMSRV_DB", "master")
    username = os.environ.get("CRMSRV_USER", "sa")
    password = os.environ.get("CRMSRV_PASS", "password")
    encoded_password = quote_plus(password)
    return f"mssql+pymssql://{username}:{encoded_password}@{server}/{database}"

engine = create_engine(get_database_url(), echo=False)
