"""
/api/user — user profile, repository list, account deletion.
"""
from fastapi import APIRouter, HTTPException, Depends  # type: ignore
from pydantic import BaseModel   # type: ignore
from core.auth import get_current_user_id  # type: ignore
from core.supabase import get_user_repositories, get_user_profile, delete_auth_user  # type: ignore

router = APIRouter()


class RepositoryItem(BaseModel):
    id: str
    repo_url: str
    repo_name: str
    created_at: str
    processing_status: str


class UserProfile(BaseModel):
    id: str
    username: str
    github_id: str
    created_at: str


class UserRepositoriesResponse(BaseModel):
    profile: UserProfile
    repositories: list[RepositoryItem]


@router.get("/user/repositories", response_model=UserRepositoriesResponse)
async def user_repositories(user_id: str = Depends(get_current_user_id)):
    profile = await get_user_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="User profile not found.")
    repos = await get_user_repositories(user_id)
    return UserRepositoriesResponse(
        profile=UserProfile(**profile),
        repositories=[RepositoryItem(**r) for r in repos],
    )


@router.delete("/user")
async def delete_user(user_id: str = Depends(get_current_user_id)):
    try:
        await delete_auth_user(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete account: {e}")
    return {"deleted": True}