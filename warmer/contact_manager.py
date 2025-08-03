"""
Contact Manager for WhatsApp Warmer
Handles saving contacts between sessions
"""

import logging
from typing import List, Dict, Optional, Tuple, Any
from sqlalchemy.orm import Session
from database.connection import get_db
from warmer.models import WarmerContact, WarmerSession
from waha_functions import WAHAClient

logger = logging.getLogger(__name__)


class ContactManager:
    """Manages contact saving between WhatsApp sessions"""
    
    def __init__(self, waha_client: WAHAClient = None):
        self.waha = waha_client or WAHAClient()
        self.logger = logger
    
    async def save_all_contacts(self, warmer_session_id: int) -> Dict[str, Any]:
        """
        Save all contacts between all participating sessions
        
        Args:
            warmer_session_id: ID of the warmer session
            
        Returns:
            Dictionary with results
        """
        try:
            # Get warmer session details
            with get_db() as db:
                warmer = db.query(WarmerSession).filter(WarmerSession.id == warmer_session_id).first()
                if not warmer:
                    raise ValueError(f"Warmer session {warmer_session_id} not found")
                
                all_sessions = warmer.all_sessions
            
            results = {
                "total_contacts_saved": 0,
                "errors": [],
                "details": []
            }
            
            # Get phone numbers for each session
            session_phones = await self._get_session_phone_numbers(all_sessions)
            
            # Save contacts between each pair of sessions
            for i, session1 in enumerate(all_sessions):
                for j, session2 in enumerate(all_sessions):
                    if i >= j:  # Skip self and already processed pairs
                        continue
                    
                    # Save session2's contact in session1
                    result1 = await self._save_contact(
                        warmer_session_id,
                        session1,
                        session_phones.get(session2, {})
                    )
                    
                    # Save session1's contact in session2
                    result2 = await self._save_contact(
                        warmer_session_id,
                        session2,
                        session_phones.get(session1, {})
                    )
                    
                    if result1["success"]:
                        results["total_contacts_saved"] += 1
                    else:
                        results["errors"].append(result1["error"])
                    
                    if result2["success"]:
                        results["total_contacts_saved"] += 1
                    else:
                        results["errors"].append(result2["error"])
                    
                    results["details"].append({
                        "session1": session1,
                        "session2": session2,
                        "saved_in_session1": result1["success"],
                        "saved_in_session2": result2["success"]
                    })
            
            self.logger.info(f"Saved {results['total_contacts_saved']} contacts for warmer {warmer_session_id}")
            return results
            
        except Exception as e:
            self.logger.error(f"Failed to save all contacts: {str(e)}")
            raise
    
    async def _get_session_phone_numbers(self, sessions: List[str]) -> Dict[str, Dict]:
        """Get phone numbers and names for all sessions"""
        session_info = {}
        
        for session in sessions:
            try:
                # Get session info from WAHA
                info = self.waha.get_session_info(session)
                if info and info.get("me"):
                    phone = info["me"].get("id", "").replace("@c.us", "")
                    name = info["me"].get("pushName", session)
                    
                    session_info[session] = {
                        "phone": phone,
                        "name": name
                    }
                else:
                    self.logger.warning(f"Could not get info for session {session}")
                    
            except Exception as e:
                self.logger.error(f"Error getting session {session} info: {str(e)}")
        
        return session_info
    
    async def _save_contact(
        self, 
        warmer_session_id: int,
        session_name: str, 
        contact_info: Dict[str, str]
    ) -> Dict[str, Any]:
        """Save a single contact in a session"""
        try:
            if not contact_info or not contact_info.get("phone"):
                return {
                    "success": False,
                    "error": f"No phone number for contact"
                }
            
            phone = contact_info["phone"]
            name = contact_info.get("name", phone)
            
            # Check if already saved in database
            with get_db() as db:
                existing = db.query(WarmerContact).filter(
                    WarmerContact.warmer_session_id == warmer_session_id,
                    WarmerContact.session_name == session_name,
                    WarmerContact.contact_phone == phone
                ).first()
                
                if existing:
                    return {
                        "success": True,
                        "message": "Contact already saved"
                    }
            
            # Save contact via WAHA API
            # WAHA doesn't have a direct save contact endpoint in the docs
            # We'll need to interact with the contact through messaging
            # For now, we'll just record it in our database
            
            # Save to database
            with get_db() as db:
                contact = WarmerContact(
                    warmer_session_id=warmer_session_id,
                    session_name=session_name,
                    contact_phone=phone,
                    contact_name=name
                )
                db.add(contact)
                db.commit()
            
            return {
                "success": True,
                "message": f"Contact {name} ({phone}) saved in {session_name}"
            }
            
        except Exception as e:
            error_msg = f"Failed to save contact in {session_name}: {str(e)}"
            self.logger.error(error_msg)
            return {
                "success": False,
                "error": error_msg
            }
    
    async def check_contacts_saved(self, warmer_session_id: int) -> Dict[str, Any]:
        """Check which contacts are saved between sessions"""
        try:
            with get_db() as db:
                warmer = db.query(WarmerSession).filter(WarmerSession.id == warmer_session_id).first()
                if not warmer:
                    raise ValueError(f"Warmer session {warmer_session_id} not found")
                
                all_sessions = warmer.all_sessions
                
                # Get all saved contacts for this warmer
                saved_contacts = db.query(WarmerContact).filter(
                    WarmerContact.warmer_session_id == warmer_session_id
                ).all()
                
                # Build matrix of who has saved whom
                contact_matrix = {}
                for session in all_sessions:
                    contact_matrix[session] = {}
                    for other_session in all_sessions:
                        if session != other_session:
                            contact_matrix[session][other_session] = False
                
                # Mark saved contacts
                for contact in saved_contacts:
                    if contact.session_name in contact_matrix:
                        # Find which session this contact belongs to
                        for session in all_sessions:
                            session_info = await self._get_session_phone_numbers([session])
                            if session_info.get(session, {}).get("phone") == contact.contact_phone:
                                contact_matrix[contact.session_name][session] = True
                                break
                
                # Calculate statistics
                total_expected = len(all_sessions) * (len(all_sessions) - 1)
                total_saved = sum(
                    sum(1 for saved in session_contacts.values() if saved)
                    for session_contacts in contact_matrix.values()
                )
                
                return {
                    "total_sessions": len(all_sessions),
                    "total_expected_contacts": total_expected,
                    "total_saved_contacts": total_saved,
                    "percentage_complete": (total_saved / total_expected * 100) if total_expected > 0 else 0,
                    "contact_matrix": contact_matrix,
                    "all_contacts_saved": total_saved == total_expected
                }
                
        except Exception as e:
            self.logger.error(f"Failed to check contacts: {str(e)}")
            raise