from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
from app.config import get_settings

oauth = OAuth(get_settings())

oauth.register(
    name='google',
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={
        'scope': 'openid email profile'
    }
)

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
)

@router.route('/login')
async def login(request: Request):
    # absolute url for callback
    # we will define it below
    redirect_uri = request.url_for('auth')
    return await oauth.google.authorize_redirect(request, redirect_uri)

@router.route('/auth')
async def auth(request: Request):
    try:
        token = await oauth.google.authorize_access_token(request)
    except OAuthError as error:
        #TODO: Change this to flash popup
        return RedirectResponse(url='/')
    user = token['userinfo']
    if user:
        request.session['user'] = dict(user)
    print(user)
    return user

@router.get('/logout')
async def logout(request: Request):
    request.session.pop('user', None)
    return RedirectResponse(url='/')