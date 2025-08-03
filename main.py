from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, Response, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional, Union
import json
import base64
import os
import logging
from waha_functions import WAHAClient

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# NEW PHASE 2 IMPORTS
try:
    from jobs.manager import CampaignManager
    from jobs.models import CampaignCreate, CampaignUpdate, MessageSample, MessageMode
    from database.connection import init_database, get_database_info
    from utils.templates import MessageTemplateEngine
    from jobs.scheduler import campaign_scheduler
    from api_extensions import router as file_router
    PHASE_2_ENABLED = True
    
    # Try to import warmer module
    try:
        from warmer.api import router as warmer_router
        WARMER_ENABLED = True
    except ImportError:
        logger.warning("WhatsApp Warmer module not available")
        WARMER_ENABLED = False
        warmer_router = None
        
except ImportError as e:
    logger.warning(f"Phase 2 components not available: {str(e)}")
    PHASE_2_ENABLED = False
    WARMER_ENABLED = False

# Initialize FastAPI app
app = FastAPI(title="WhatsApp Agent", description="Complete WhatsApp Management Interface", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Initialize WAHA client
waha = WAHAClient()

# Initialize Phase 2 components if available
if PHASE_2_ENABLED:
    campaign_manager = CampaignManager()
    template_engine = MessageTemplateEngine()
    
    # Include file processing router
    app.include_router(file_router, prefix="/api/files", tags=["files"])
    
    # Include warmer router if available
    if WARMER_ENABLED and warmer_router:
        app.include_router(warmer_router)
        logger.info("WhatsApp Warmer routes included")
    
    # Initialize database
    init_database()
else:
    campaign_manager = None
    template_engine = None

# Pydantic models for request validation
class SessionCreate(BaseModel):
    name: str
    config: Optional[Dict] = None

class MessageSend(BaseModel):
    chatId: str
    text: str
    session: str

class FileMessage(BaseModel):
    chatId: str
    session: str
    caption: Optional[str] = ""

class LocationMessage(BaseModel):
    chatId: str
    session: str
    latitude: float
    longitude: float
    title: Optional[str] = ""

class GroupCreate(BaseModel):
    name: str
    participants: List[str]

class ContactAction(BaseModel):
    contactId: str
    session: str

class PhoneCheck(BaseModel):
    phone: str
    session: str

# ==================== STATIC ROUTES ====================

@app.get("/", response_class=HTMLResponse)
async def dashboard():
    """Serve main dashboard"""
    try:
        with open("static/index.html", "r", encoding="utf-8") as f:
            return HTMLResponse(f.read())
    except FileNotFoundError:
        return HTMLResponse("<h1>Static files not found. Please ensure static/index.html exists.</h1>")

# ==================== SESSION MANAGEMENT ====================

@app.get("/api/sessions")
async def get_sessions():
    """Get all sessions"""
    try:
        sessions = waha.get_sessions()
        return {"success": True, "data": sessions}
    except Exception as e:
        logger.error(f"Error getting sessions: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sessions")
async def create_session(session_data: SessionCreate):
    """Create new session"""
    try:
        result = waha.create_session(session_data.name, session_data.config)
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Error creating session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sessions/{session_name}")
async def get_session_info(session_name: str):
    """Get session information"""
    try:
        info = waha.get_session_info(session_name)
        return {"success": True, "data": info}
    except Exception as e:
        logger.error(f"Error getting session info: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sessions/{session_name}/start")
async def start_session(session_name: str):
    """Start session"""
    try:
        result = waha.start_session(session_name)
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Error starting session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sessions/{session_name}/stop")
async def stop_session(session_name: str):
    """Stop session"""
    try:
        result = waha.stop_session(session_name)
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Error stopping session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sessions/{session_name}/restart")
async def restart_session(session_name: str):
    """Restart session"""
    try:
        result = waha.restart_session(session_name)
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Error restarting session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/sessions/{session_name}")
async def delete_session(session_name: str):
    """Delete session"""
    try:
        result = waha.delete_session(session_name)
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Error deleting session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== AUTHENTICATION ====================

@app.get("/api/sessions/{session_name}/qr")
async def get_qr_code(session_name: str):
    """Get QR code image"""
    try:
        qr_image = waha.get_qr_code(session_name)
        return Response(content=qr_image, media_type="image/png")
    except Exception as e:
        logger.error(f"Error getting QR code: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sessions/{session_name}/screenshot")
async def get_screenshot(session_name: str):
    """Get screenshot"""
    try:
        screenshot = waha.get_screenshot(session_name)
        return Response(content=screenshot, media_type="image/png")
    except Exception as e:
        logger.error(f"Error getting screenshot: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== MESSAGING ====================

@app.post("/api/messages/text")
async def send_text_message(message: MessageSend):
    """Send text message"""
    try:
        result = waha.send_text(message.session, message.chatId, message.text)
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Error sending text message: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/messages/file")
async def send_file_message(
    file: UploadFile = File(...),
    chatId: str = Form(...),
    session: str = Form(...),
    caption: str = Form("")
):
    """Send file message"""
    try:
        # Read file content
        file_content = await file.read()
        file_data = {
            "mimetype": file.content_type,
            "filename": file.filename,
            "data": base64.b64encode(file_content).decode('utf-8')
        }
        
        # Determine file type and send accordingly
        if file.content_type.startswith('image/'):
            result = waha.send_image(session, chatId, file_data, caption)
        elif file.content_type.startswith('video/'):
            result = waha.send_video(session, chatId, file_data, caption)
        elif file.content_type.startswith('audio/'):
            result = waha.send_voice(session, chatId, file_data)
        else:
            result = waha.send_file(session, chatId, file_data)
        
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Error sending file: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/messages/location")
async def send_location_message(location: LocationMessage):
    """Send location message"""
    try:
        result = waha.send_location(
            location.session, 
            location.chatId, 
            location.latitude, 
            location.longitude, 
            location.title
        )
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Error sending location: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/messages/{session}/{chat_id}/typing/start")
async def start_typing(session: str, chat_id: str):
    """Start typing indicator"""
    try:
        result = waha.start_typing(session, chat_id)
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Error starting typing: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/messages/{session}/{chat_id}/typing/stop")
async def stop_typing(session: str, chat_id: str):
    """Stop typing indicator"""
    try:
        result = waha.stop_typing(session, chat_id)
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Error stopping typing: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== CHATS ====================

@app.get("/api/chats/{session}")
async def get_chats(session: str):
    """Get all chats"""
    try:
        chats = waha.get_chats(session)
        return {"success": True, "data": chats}
    except Exception as e:
        logger.error(f"Error getting chats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/chats/{session}/{chat_id}/messages")
async def get_chat_messages(session: str, chat_id: str, limit: int = 50):
    """Get chat messages"""
    try:
        messages = waha.get_chat_messages(session, chat_id, limit)
        return {"success": True, "data": messages}
    except Exception as e:
        logger.error(f"Error getting chat messages: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chats/{session}/{chat_id}/read")
async def mark_chat_as_read(session: str, chat_id: str):
    """Mark chat as read"""
    try:
        result = waha.mark_chat_as_read(session, chat_id)
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Error marking chat as read: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/chats/{session}/{chat_id}")
async def delete_chat(session: str, chat_id: str):
    """Delete chat"""
    try:
        result = waha.delete_chat(session, chat_id)
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Error deleting chat: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chats/{session}/{chat_id}/archive")
async def archive_chat(session: str, chat_id: str):
    """Archive chat"""
    try:
        result = waha.archive_chat(session, chat_id)
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Error archiving chat: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== CONTACTS ====================

@app.get("/api/contacts/{session}")
async def get_all_contacts(session: str):
    """Get all contacts"""
    try:
        contacts = waha.get_all_contacts(session)
        return {"success": True, "data": contacts}
    except Exception as e:
        logger.error(f"Error getting contacts: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/contacts/{session}/check/{phone}")
async def check_number_exists(session: str, phone: str):
    """Check if number exists on WhatsApp"""
    try:
        result = waha.check_number_exists(session, phone)
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Error checking number: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/contacts/block")
async def block_contact(contact_action: ContactAction):
    """Block contact"""
    try:
        result = waha.block_contact(contact_action.session, contact_action.contactId)
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Error blocking contact: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/contacts/unblock")
async def unblock_contact(contact_action: ContactAction):
    """Unblock contact"""
    try:
        result = waha.unblock_contact(contact_action.session, contact_action.contactId)
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Error unblocking contact: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== GROUPS ====================

@app.get("/api/groups/{session}")
async def get_groups(session: str):
    """Get all groups"""
    try:
        groups = waha.get_groups(session)
        return {"success": True, "data": groups}
    except Exception as e:
        logger.error(f"Error getting groups: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/groups/{session}")
async def create_group(session: str, group_data: GroupCreate):
    """Create group"""
    try:
        result = waha.create_group(session, group_data.name, group_data.participants)
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Error creating group: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/groups/{session}/{group_id}")
async def get_group_info(session: str, group_id: str):
    """Get group info"""
    try:
        info = waha.get_group_info(session, group_id)
        return {"success": True, "data": info}
    except Exception as e:
        logger.error(f"Error getting group info: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/groups/{session}/{group_id}/leave")
async def leave_group(session: str, group_id: str):
    """Leave group"""
    try:
        result = waha.leave_group(session, group_id)
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"Error leaving group: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/groups/{session}/{group_id}/export")
async def export_group_participants(session: str, group_id: str):
    """Export group participants with detailed contact information"""
    try:
        # Handle URL encoding - group_id might come URL encoded
        import urllib.parse
        group_id = urllib.parse.unquote(group_id)
        
        # Get group info first
        group_info = waha.get_group_info(session, group_id)
        
        # Extract group name from the correct location in WAHA response
        if isinstance(group_info, dict):
            if 'groupMetadata' in group_info and 'subject' in group_info['groupMetadata']:
                group_name = group_info['groupMetadata']['subject']
            elif 'name' in group_info:
                group_name = group_info['name']
            else:
                group_name = 'Unknown Group'
        else:
            group_name = 'Unknown Group'
        
        # Get detailed participant information
        participants = waha.get_group_participants_details(session, group_id)
        
        # Import export handler
        from utils.export_handler import GroupExportHandler
        export_handler = GroupExportHandler()
        
        # Export to both formats
        export_result = export_handler.export_group_participants(
            participants=participants,
            group_name=group_name,
            session_name=session
        )
        
        return {
            "success": True,
            "data": export_result,
            "message": f"Exported {export_result['participant_count']} participants"
        }
        
    except Exception as e:
        logger.error(f"Error exporting group participants: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== SERVER INFO ====================

@app.get("/api/server/info")
async def get_server_info():
    """Get server information"""
    try:
        version = waha.get_server_version()
        status = waha.get_server_status()
        return {
            "success": True, 
            "data": {
                "version": version,
                "status": status
            }
        }
    except Exception as e:
        logger.error(f"Error getting server info: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ping")
async def ping_server():
    """Ping WAHA server"""
    try:
        result = waha.ping_server()
        return {"success": True, "data": {"message": result}}
    except Exception as e:
        logger.error(f"Error pinging server: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== PHASE 2: CAMPAIGN MANAGEMENT ====================

if PHASE_2_ENABLED:
    
    @app.get("/api/campaigns")
    async def get_campaigns():
        """Get all campaigns"""
        try:
            campaigns = campaign_manager.get_campaigns()
            return {"success": True, "data": [c.dict() for c in campaigns]}
        except Exception as e:
            logger.error(f"Error getting campaigns: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.post("/api/campaigns")
    async def create_campaign(campaign_data: CampaignCreate):
        """Create new campaign"""
        try:
            campaign = campaign_manager.create_campaign(campaign_data)
            return {"success": True, "data": campaign.dict()}
        except Exception as e:
            logger.error(f"Error creating campaign: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.get("/api/campaigns/stats")
    async def get_campaign_stats():
        """Get campaign statistics"""
        try:
            stats = campaign_manager.get_campaign_stats()
            return {"success": True, "data": stats.dict()}
        except Exception as e:
            logger.error(f"Error getting campaign stats: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.get("/api/campaigns/{campaign_id}")
    async def get_campaign(campaign_id: int):
        """Get campaign by ID"""
        try:
            campaign = campaign_manager.get_campaign(campaign_id)
            if not campaign:
                raise HTTPException(status_code=404, detail="Campaign not found")
            return {"success": True, "data": campaign.dict()}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting campaign {campaign_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.post("/api/campaigns/{campaign_id}/start")
    async def start_campaign(campaign_id: int):
        """Start campaign"""
        try:
            success = campaign_manager.start_campaign(campaign_id)
            if not success:
                raise HTTPException(status_code=404, detail="Campaign not found")
            return {"success": True, "message": "Campaign started"}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error starting campaign {campaign_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.post("/api/campaigns/{campaign_id}/pause")
    async def pause_campaign(campaign_id: int):
        """Pause campaign"""
        try:
            success = campaign_manager.pause_campaign(campaign_id)
            if not success:
                raise HTTPException(status_code=404, detail="Campaign not found")
            return {"success": True, "message": "Campaign paused"}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error pausing campaign {campaign_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.post("/api/campaigns/{campaign_id}/stop")
    async def stop_campaign(campaign_id: int):
        """Stop campaign"""
        try:
            success = campaign_manager.stop_campaign(campaign_id)
            if not success:
                raise HTTPException(status_code=404, detail="Campaign not found")
            return {"success": True, "message": "Campaign stopped"}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error stopping campaign {campaign_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.delete("/api/campaigns/{campaign_id}")
    async def delete_campaign(campaign_id: int):
        """Delete campaign"""
        try:
            success = campaign_manager.delete_campaign(campaign_id)
            if not success:
                raise HTTPException(status_code=404, detail="Campaign not found")
            return {"success": True, "message": "Campaign deleted"}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error deleting campaign {campaign_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.post("/api/templates/preview")
    async def preview_template(template: str = Form(...), sample_data: str = Form(...)):
        """Preview message template with sample data"""
        try:
            sample_dict = json.loads(sample_data)
            preview = template_engine.preview_message(template, sample_dict)
            return {"success": True, "data": preview}
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON in sample_data")
        except Exception as e:
            logger.error(f"Error previewing template: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.get("/api/database/info")
    async def get_database_info_endpoint():
        """Get database information"""
        try:
            info = get_database_info()
            return {"success": True, "data": info}
        except Exception as e:
            logger.error(f"Error getting database info: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))

else:
    @app.get("/api/campaigns")
    async def campaigns_not_available():
        """Campaign endpoints not available"""
        raise HTTPException(
            status_code=503, 
            detail="Campaign management not available. Please install Phase 2 dependencies."
        )

# ==================== ERROR HANDLERS ====================

@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse(
        status_code=404,
        content={"success": False, "error": "Endpoint not found"}
    )

@app.exception_handler(500)
async def internal_error_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": "Internal server error"}
    )

# ==================== STARTUP EVENT ====================

@app.on_event("startup")
async def startup_event():
    """Initialize application on startup"""
    logger.info("WhatsApp Agent API Server starting up...")
    
    # Create static directory if it doesn't exist
    os.makedirs("static", exist_ok=True)
    os.makedirs("static/css", exist_ok=True)
    os.makedirs("static/js", exist_ok=True)
    os.makedirs("static/uploads", exist_ok=True)
    os.makedirs("static/exports", exist_ok=True)
    
    # Initialize Phase 2 database if available
    if PHASE_2_ENABLED:
        try:
            logger.info("Initializing Phase 2 database...")
            success = init_database()
            if success:
                logger.info("✅ Phase 2 database initialized successfully")
                
                # Start campaign scheduler
                logger.info("Starting campaign scheduler...")
                await campaign_scheduler.start()
                logger.info("✅ Campaign scheduler started")
            else:
                logger.error("❌ Phase 2 database initialization failed")
        except Exception as e:
            logger.error(f"❌ Phase 2 database initialization error: {str(e)}")
    else:
        logger.info("⚠️ Phase 2 features not available")
    
    logger.info("WhatsApp Agent API Server started successfully!")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on server shutdown"""
    logger.info("WhatsApp Agent API Server shutting down...")
    
    if PHASE_2_ENABLED:
        try:
            logger.info("Stopping campaign scheduler...")
            await campaign_scheduler.stop()
            logger.info("✅ Campaign scheduler stopped")
        except Exception as e:
            logger.error(f"❌ Error stopping scheduler: {str(e)}")
    
    logger.info("WhatsApp Agent API Server shutdown complete!")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )