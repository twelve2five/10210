"""
Campaign Scheduler - Background task management and automation
Handles campaign scheduling, monitoring, and automated operations
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from sqlalchemy.orm import Session
from sqlalchemy import text

from database.connection import get_db
from database.models import Campaign, Delivery
from jobs.models import CampaignStatus
from jobs.processor import message_processor

logger = logging.getLogger(__name__)

class CampaignScheduler:
    """Background scheduler for campaign management"""
    
    def __init__(self):
        self.running = False
        self.scheduler_task = None
        self.check_interval = 30  # seconds
        
    async def start(self):
        """Start the scheduler"""
        if self.running:
            logger.warning("Scheduler is already running")
            return
        
        self.running = True
        self.scheduler_task = asyncio.create_task(self._scheduler_loop())
        logger.info("🕒 Campaign scheduler started")
    
    async def stop(self):
        """Stop the scheduler"""
        if not self.running:
            return
        
        self.running = False
        if self.scheduler_task:
            self.scheduler_task.cancel()
            try:
                await self.scheduler_task
            except asyncio.CancelledError:
                pass
        
        logger.info("🛑 Campaign scheduler stopped")
    
    async def _scheduler_loop(self):
        """Main scheduler loop"""
        try:
            while self.running:
                try:
                    # Check for campaigns to start
                    await self._check_pending_campaigns()
                    
                    # Monitor active campaigns
                    await self._monitor_active_campaigns()
                    
                    # Cleanup completed campaigns
                    await self._cleanup_old_data()
                    
                    # Health checks
                    await self._perform_health_checks()
                    
                except Exception as e:
                    logger.error(f"Scheduler loop error: {str(e)}")
                
                # Wait before next check
                await asyncio.sleep(self.check_interval)
                
        except asyncio.CancelledError:
            logger.info("Scheduler loop cancelled")
        except Exception as e:
            logger.error(f"Scheduler loop crashed: {str(e)}")
    
    async def _check_pending_campaigns(self):
        """Check for campaigns that should be started"""
        try:
            with get_db() as db:
                # Find campaigns in RUNNING status that aren't being processed
                pending_campaigns = db.query(Campaign).filter(
                    Campaign.status == CampaignStatus.RUNNING.value
                ).all()
                
                for campaign in pending_campaigns:
                    # Check if already being processed
                    if campaign.id not in message_processor.active_campaigns:
                        logger.info(f"Starting pending campaign: {campaign.id}")
                        
                        # Start processing
                        success = await message_processor.start_campaign_processing(campaign.id)
                        if not success:
                            # Mark as failed if can't start
                            campaign.status = CampaignStatus.FAILED.value
                            campaign.completed_at = datetime.utcnow()
                            db.commit()
                            
        except Exception as e:
            logger.error(f"Error checking pending campaigns: {str(e)}")
    
    async def _monitor_active_campaigns(self):
        """Monitor active campaigns for issues"""
        try:
            active_campaign_ids = list(message_processor.active_campaigns.keys())
            
            with get_db() as db:
                for campaign_id in active_campaign_ids:
                    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
                    if not campaign:
                        continue
                    
                    # Check if campaign should be paused (e.g., too many errors)
                    await self._check_campaign_health(campaign)
                    
                    # Check for stuck campaigns
                    await self._check_campaign_progress(campaign)
                    
        except Exception as e:
            logger.error(f"Error monitoring active campaigns: {str(e)}")
    
    async def _check_campaign_health(self, campaign: Campaign):
        """Check individual campaign health"""
        try:
            with get_db() as db:
                # Check error rate
                if campaign.processed_rows > 10:  # Only check after processing some rows
                    error_rate = (campaign.error_count / campaign.processed_rows) * 100
                    
                    if error_rate > 50:  # More than 50% errors
                        logger.warning(f"Campaign {campaign.id} has high error rate: {error_rate:.1f}%")
                        
                        # Pause campaign
                        campaign.status = CampaignStatus.PAUSED.value
                        db.commit()
                        
                        # Stop processing
                        await message_processor.stop_campaign_processing(campaign.id)
                        
                        logger.info(f"Campaign {campaign.id} paused due to high error rate")
                
                # Check if session is still working
                # TODO: Implement session health check
                
        except Exception as e:
            logger.error(f"Error checking campaign health {campaign.id}: {str(e)}")
    
    async def _check_campaign_progress(self, campaign: Campaign):
        """Check if campaign is making progress"""
        try:
            # Check if campaign has been running for too long without progress
            if campaign.started_at:
                running_time = datetime.utcnow() - campaign.started_at
                
                # If running for more than 1 hour with no progress
                if running_time > timedelta(hours=1) and campaign.processed_rows == 0:
                    logger.warning(f"Campaign {campaign.id} stuck - no progress in {running_time}")
                    
                    with get_db() as db:
                        campaign.status = CampaignStatus.FAILED.value
                        campaign.completed_at = datetime.utcnow()
                        db.commit()
                    
                    await message_processor.stop_campaign_processing(campaign.id)
                    
        except Exception as e:
            logger.error(f"Error checking campaign progress {campaign.id}: {str(e)}")
    
    async def _cleanup_old_data(self):
        """Cleanup old completed campaigns and data"""
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=7)  # Keep data for 7 days
            
            with get_db() as db:
                # Find old completed campaigns
                old_campaigns = db.query(Campaign).filter(
                    Campaign.status.in_([CampaignStatus.COMPLETED.value, CampaignStatus.FAILED.value]),
                    Campaign.completed_at < cutoff_date
                ).all()
                
                for campaign in old_campaigns:
                    # Delete old delivery records (keep campaign for stats)
                    old_deliveries = db.query(Delivery).filter(
                        Delivery.campaign_id == campaign.id,
                        Delivery.created_at < cutoff_date
                    ).delete()
                    
                    if old_deliveries > 0:
                        logger.info(f"Cleaned up {old_deliveries} old delivery records from campaign {campaign.id}")
                
                db.commit()
                
        except Exception as e:
            logger.error(f"Error during cleanup: {str(e)}")
    
    async def _perform_health_checks(self):
        """Perform system health checks"""
        try:
            # Check database health
            with get_db() as db:
                db.execute(text("SELECT 1")).fetchone()
            
            # Check message processor health
            processor_status = message_processor.get_processing_status()
            
            # Log health status periodically
            if datetime.utcnow().minute % 10 == 0:  # Every 10 minutes
                logger.info(f"Health check: DB ✅, Processor ✅ ({processor_status['total_active']} active)")
                
        except Exception as e:
            logger.error(f"Health check failed: {str(e)}")
    
    def get_scheduler_status(self) -> Dict[str, Any]:
        """Get scheduler status"""
        return {
            "running": self.running,
            "check_interval": self.check_interval,
            "active_campaigns": len(message_processor.active_campaigns),
            "processor_status": message_processor.get_processing_status()
        }

# Global scheduler instance
campaign_scheduler = CampaignScheduler()
