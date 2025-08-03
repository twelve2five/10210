"""
WhatsApp Warmer API Endpoints
"""

import logging
from typing import List, Optional, Dict
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from warmer.warmer_engine import warmer_engine
from warmer.models import WarmerStatus

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/warmer", tags=["WhatsApp Warmer"])


# Request/Response Models
class CreateWarmerRequest(BaseModel):
    """Request model for creating warmer session"""
    name: str = Field(..., description="Name for the warmer session")
    orchestrator_session: str = Field(..., description="Session that orchestrates the warming")
    participant_sessions: List[str] = Field(..., min_items=1, description="List of participant sessions")
    config: Optional[Dict] = Field(None, description="Optional configuration overrides")
    group_invite_links: Optional[List[str]] = Field(None, description="Optional list of 5 group invite links")


class WarmerResponse(BaseModel):
    """Response model for warmer operations"""
    success: bool
    message: Optional[str] = None
    data: Optional[Dict] = None
    error: Optional[str] = None


class WarmerStatusResponse(BaseModel):
    """Response model for warmer status"""
    id: int
    name: str
    status: str
    is_active: bool
    statistics: Dict
    sessions: Optional[Dict] = None


class JoinGroupsRequest(BaseModel):
    """Request model for joining groups with invite links"""
    invite_links: List[str] = Field(..., min_items=1, max_items=5, description="WhatsApp group invite links (up to 5)")


# API Endpoints
@router.post("/create")
async def create_warmer(request: CreateWarmerRequest) -> WarmerResponse:
    """
    Create a new warmer session
    
    Requires:
    - At least 2 total sessions (1 orchestrator + 1+ participants)
    - All sessions must be in WORKING state
    """
    try:
        result = await warmer_engine.create_warmer_session(
            name=request.name,
            orchestrator_session=request.orchestrator_session,
            participant_sessions=request.participant_sessions,
            config=request.config
        )
        
        if result["success"]:
            return WarmerResponse(
                success=True,
                message="Warmer session created successfully",
                data=result
            )
        else:
            return WarmerResponse(
                success=False,
                error=result.get("error", "Failed to create warmer session")
            )
            
    except Exception as e:
        logger.error(f"Error creating warmer: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{warmer_id}/start")
async def start_warmer(warmer_id: int) -> WarmerResponse:
    """
    Start warming process
    
    This will:
    1. Save contacts between all sessions
    2. Ensure 5 common groups exist
    3. Start continuous conversations
    """
    try:
        result = await warmer_engine.start_warming(warmer_id)
        
        if result["success"]:
            return WarmerResponse(
                success=True,
                message=result["message"],
                data={
                    "warmer_id": warmer_id,
                    "contacts_saved": result.get("contacts_saved", 0),
                    "groups_ready": result.get("groups_ready", 0)
                }
            )
        else:
            return WarmerResponse(
                success=False,
                error=result.get("error", "Failed to start warming")
            )
            
    except Exception as e:
        logger.error(f"Error starting warmer: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{warmer_id}/stop")
async def stop_warmer(warmer_id: int) -> WarmerResponse:
    """Stop warming process"""
    try:
        result = await warmer_engine.stop_warming(warmer_id)
        
        if result["success"]:
            return WarmerResponse(
                success=True,
                message=result["message"]
            )
        else:
            return WarmerResponse(
                success=False,
                error=result.get("error", "Failed to stop warming")
            )
            
    except Exception as e:
        logger.error(f"Error stopping warmer: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{warmer_id}/status")
async def get_warmer_status(warmer_id: int) -> WarmerStatusResponse:
    """Get current status of warmer session"""
    try:
        status = warmer_engine.get_warmer_status(warmer_id)
        
        if "error" in status:
            raise HTTPException(status_code=404, detail=status["error"])
        
        return WarmerStatusResponse(**status)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting warmer status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{warmer_id}/groups/check")
async def check_warmer_groups(warmer_id: int) -> Dict:
    """Check current group status for warmer"""
    try:
        from database.connection import get_db
        from warmer.models import WarmerSession
        from warmer.group_manager import GroupManager
        
        # Get warmer session
        with get_db() as db:
            warmer = db.query(WarmerSession).filter(WarmerSession.id == warmer_id).first()
            if not warmer:
                raise HTTPException(status_code=404, detail="Warmer session not found")
            
            all_sessions = warmer.all_sessions
        
        # Check common groups
        group_manager = GroupManager()
        common_groups = await group_manager._get_common_groups(all_sessions)
        
        return {
            "success": True,
            "warmer_id": warmer_id,
            "total_sessions": len(all_sessions),
            "common_groups_count": len(common_groups),
            "groups_needed": max(0, 5 - len(common_groups)),
            "has_enough_groups": len(common_groups) >= 5,
            "common_group_ids": list(common_groups)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking warmer groups: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
async def list_warmers() -> List[Dict]:
    """Get all warmer sessions"""
    try:
        warmers = warmer_engine.get_all_warmers()
        return warmers
        
    except Exception as e:
        logger.error(f"Error listing warmers: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{warmer_id}/metrics")
async def get_warmer_metrics(warmer_id: int) -> Dict:
    """Get detailed metrics for a warmer session"""
    try:
        # Get warmer status
        status = warmer_engine.get_warmer_status(warmer_id)
        
        if "error" in status:
            raise HTTPException(status_code=404, detail=status["error"])
        
        # Get additional metrics from database
        from database.connection import get_db
        from warmer.models import WarmerSession, WarmerGroup, WarmerConversation
        
        with get_db() as db:
            warmer = db.query(WarmerSession).filter(WarmerSession.id == warmer_id).first()
            if not warmer:
                raise HTTPException(status_code=404, detail="Warmer session not found")
            
            # Count active groups
            active_groups = db.query(WarmerGroup).filter(
                WarmerGroup.warmer_session_id == warmer_id,
                WarmerGroup.is_active == True
            ).count()
            
            # Get recent conversations
            recent_conversations = db.query(WarmerConversation).filter(
                WarmerConversation.warmer_session_id == warmer_id
            ).order_by(WarmerConversation.sent_at.desc()).limit(10).all()
            
            # Calculate message rate
            message_rate = 0
            if warmer.duration_minutes and warmer.duration_minutes > 0:
                message_rate = warmer.total_messages_sent / warmer.duration_minutes
            
            return {
                "warmer_id": warmer_id,
                "name": warmer.name,
                "status": warmer.status,
                "statistics": {
                    "total_messages": warmer.total_messages_sent,
                    "group_messages": warmer.total_group_messages,
                    "direct_messages": warmer.total_direct_messages,
                    "groups_created": warmer.total_groups_created,
                    "active_groups": active_groups,
                    "duration_minutes": warmer.duration_minutes,
                    "message_rate_per_minute": round(message_rate, 2)
                },
                "recent_conversations": [
                    {
                        "sender": conv.sender_session,
                        "type": conv.message_type,
                        "message": conv.message_content[:100] + "..." if len(conv.message_content) > 100 else conv.message_content,
                        "sent_at": conv.sent_at.isoformat() if conv.sent_at else None
                    }
                    for conv in recent_conversations
                ],
                "configuration": {
                    "orchestrator": warmer.orchestrator_session,
                    "participants": warmer.participant_sessions,
                    "total_sessions": len(warmer.all_sessions),
                    "group_delay": f"{warmer.group_message_delay_min}-{warmer.group_message_delay_max}s",
                    "direct_delay": f"{warmer.direct_message_delay_min}-{warmer.direct_message_delay_max}s"
                }
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting warmer metrics: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{warmer_id}/join-groups")
async def join_groups(warmer_id: int, request: JoinGroupsRequest) -> WarmerResponse:
    """Join groups using invite links for all sessions in the warmer"""
    try:
        # Check if warmer exists
        status = warmer_engine.get_warmer_status(warmer_id)
        
        if "error" in status:
            raise HTTPException(status_code=404, detail=status["error"])
        
        # Join groups using the group manager
        from warmer.group_manager import GroupManager
        group_manager = GroupManager()
        
        result = await group_manager.join_groups_by_links(warmer_id, request.invite_links)
        
        if result["validation_passed"]:
            return WarmerResponse(
                success=True,
                message=f"Successfully joined {len(result['joined_groups'])} groups with all sessions",
                data=result
            )
        else:
            return WarmerResponse(
                success=False,
                error=f"Only {len(result['joined_groups'])} out of {len(request.invite_links)} groups were joined by all sessions",
                data=result
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error joining groups: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{warmer_id}")
async def delete_warmer(warmer_id: int) -> WarmerResponse:
    """Delete a warmer session (must be stopped first)"""
    try:
        # Check if warmer is active
        status = warmer_engine.get_warmer_status(warmer_id)
        
        if "error" in status:
            raise HTTPException(status_code=404, detail=status["error"])
        
        if status["is_active"]:
            return WarmerResponse(
                success=False,
                error="Cannot delete active warmer. Stop it first."
            )
        
        # Delete from database
        from database.connection import get_db
        from warmer.models import WarmerSession
        
        with get_db() as db:
            warmer = db.query(WarmerSession).filter(WarmerSession.id == warmer_id).first()
            if not warmer:
                raise HTTPException(status_code=404, detail="Warmer session not found")
            
            db.delete(warmer)
            db.commit()
        
        return WarmerResponse(
            success=True,
            message="Warmer session deleted successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting warmer: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))